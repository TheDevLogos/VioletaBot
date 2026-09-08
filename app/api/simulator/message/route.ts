import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { evaluateRisk } from '@/lib/risk/engine';
import {
  combineDistress,
  evaluateDistress,
} from '@/lib/risk/distress';
import {
  generateVioletaReply,
  higherRisk,
  type ChatTurn,
  type RiskLevel,
} from '@/lib/bot/violeta';
import { assessSemanticTriage } from '@/lib/bot/triage';
import { referralPriorityFor, referralTypeFor } from '@/lib/care/decisions';
import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const ctx = await getStaffContext();

  if (!ctx || !ctx.active || !ctx.organizationId) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    );
  }

  if (
    ![
      'super_admin',
      'admin',
      'supervisor',
      'operator',
    ].includes(ctx.role)
  ) {
    return NextResponse.json(
      { error: 'Sin permiso para simular' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim();

  if (!text || text.length > 5000) {
    return NextResponse.json(
      { error: 'Mensaje inválido' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data: org } = await db
    .from('organizations')
    .select('name,bot_name,bot_model')
    .eq('id', ctx.organizationId)
    .maybeSingle();

  let conversationId = String(body.conversationId || '');
  let conv: any = null;

  if (conversationId) {
    const { data } = await db
      .from('conversations')
      .select(
        'id,organization_id,recurrence_count,channel,conversation_stage'
      )
      .eq('id', conversationId)
      .maybeSingle();

    if (
      data?.organization_id === ctx.organizationId &&
      data.channel === 'simulator'
    ) {
      conv = data;
    }
  }

  if (!conv) {
    const now = new Date();
    const label =
      `Simulación ${now.toLocaleDateString('es-MX')} ` +
      now.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      });

    const created = await db
      .from('conversations')
      .insert({
        organization_id: ctx.organizationId,
        wa_user_id: `SIM-${randomUUID()}`,
        status: 'open',
        channel: 'simulator',
        is_test: true,
        conversation_stage: 'greeting',
        subject_label: label,
      })
      .select(
        'id,organization_id,recurrence_count,channel,conversation_stage'
      )
      .single();

    if (created.error || !created.data) {
      return NextResponse.json(
        { error: 'No se pudo crear la simulación' },
        { status: 500 }
      );
    }

    conv = created.data;
    conversationId = conv.id;
  }

  const [
    previousRiskResult,
    recentResult,
  ] = await Promise.all([
    db
      .from('risk_events')
      .select('level,score,triggers,categories')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db
      .from('messages')
      .select('direction,content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(16),
  ]);

  await db.from('messages').insert({
    conversation_id: conversationId,
    direction: 'inbound',
    message_type: 'text',
    content: text,
    metadata: {
      simulator: true,
      created_by: ctx.userId,
    },
  });

  const recentBeforeCurrent: ChatTurn[] = (
    recentResult.data || []
  )
    .reverse()
    .filter((item: any) => item.content)
    .map((item: any): ChatTurn => ({
      role:
        item.direction === 'outbound'
          ? 'assistant'
          : 'user',
      content: String(item.content),
    }));

  const history: ChatTurn[] = [
    ...recentBeforeCurrent,
    {
      role: 'user',
      content: text,
    } as ChatTurn,
  ].slice(-16);

  const currentRisk = evaluateRisk(
    text,
    conv.recurrence_count || 0
  );

  const risk = higherRisk(
    currentRisk,
    previousRiskResult.data as any
  );

  const rulesDistress = evaluateDistress(text);

  const semantic = await assessSemanticTriage({
    history,
    currentText: text,
    model: org?.bot_model,
    safetySource: `sim:${ctx.userId}:${conversationId}`,
  });

  const distress = combineDistress(
    rulesDistress,
    semantic
  );

  await Promise.all([
    db.from('risk_events').insert({
      conversation_id: conversationId,
      level: risk.level,
      score: risk.score,
      triggers: risk.triggers,
      categories: risk.categories,
      source_text: text,
    }),

    db.from('distress_events').insert({
      conversation_id: conversationId,
      distress_level: distress.distressLevel,
      self_harm_level: distress.selfHarmLevel,
      hopelessness: distress.hopelessness,
      panic_signals: distress.panicSignals,
      triggers: distress.triggers,
      semantic_summary:
        'semanticSummary' in distress
          ? distress.semanticSummary || null
          : null,
      confidence:
        'confidence' in distress
          ? distress.confidence ?? null
          : null,
      source: semantic ? 'combined' : 'rules',
    }),
  ]);

  const stage =
    risk.level === 'critical' ||
    distress.selfHarmLevel === 'imminent'
      ? 'crisis'
      : distress.offerTherapist
        ? 'referral_offer'
        : distress.distressLevel === 'high' ||
            distress.distressLevel === 'severe'
          ? 'supporting'
          : history.filter((turn) => turn.role === 'user')
                .length > 2
            ? 'exploring'
            : conv.conversation_stage || 'listening';

  const reply = await generateVioletaReply({
    history,
    risk,
    distress,
    previousRiskLevel:
      (previousRiskResult.data?.level as RiskLevel | undefined) ||
      null,
    stage,
    organizationName: org?.name,
    botName: org?.bot_name,
    model: org?.bot_model,
    safetySource: `sim:${ctx.userId}:${conversationId}`,
    careOffer: distress.offerTherapist,
  });

  await db.from('messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    message_type: 'text',
    content: reply,
    metadata: {
      simulator: true,
      risk_level: risk.level,
      distress_level: distress.distressLevel,
      self_harm_level: distress.selfHarmLevel,
      care_offer: distress.offerTherapist,
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
  });

  if (distress.offerTherapist) {
    const { data: existing } = await db
      .from('referrals')
      .select('id,status')
      .eq('conversation_id', conversationId)
      .eq('is_test', true)
      .in('status', [
        'offered',
        'queued',
        'assigned',
        'accepted',
        'contacted',
        'in_progress',
        'follow_up',
      ])
      .limit(1)
      .maybeSingle();

    if (!existing) {
      await db.from('referrals').insert({
        organization_id: ctx.organizationId,
        conversation_id: conversationId,
        referral_type: referralTypeFor(
          risk,
          distress
        ),
        priority: referralPriorityFor(
          risk,
          distress
        ),
        status: 'offered',
        reason:
          distress.triggers.join(', ') ||
          'Simulación de apoyo emocional',
        summary:
          'semanticSummary' in distress
            ? distress.semanticSummary || null
            : null,
        is_test: true,
      });
    }
  }

  if (risk.requiresHuman || distress.needsHuman) {
    const { data: pending } = await db
      .from('alerts')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('alert_type', 'operator')
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (!pending) {
      const priority =
        risk.level === 'critical' ||
        distress.selfHarmLevel === 'imminent'
          ? 'critical'
          : risk.level === 'high' ||
              distress.selfHarmLevel === 'high' ||
              distress.distressLevel === 'severe'
            ? 'high'
            : 'medium';

      await db.from('alerts').insert({
        conversation_id: conversationId,
        alert_type: 'operator',
        status: 'pending',
        priority,
        payload: {
          simulation: true,
          risk,
          distress,
        },
      });
    }
  }

  await db
    .from('conversations')
    .update({
      conversation_stage: stage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  await db.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.userId,
    action: 'simulator.message_evaluated',
    entity_type: 'conversation',
    entity_id: conversationId,
    metadata: {
      risk_level: risk.level,
      score: risk.score,
      distress_level: distress.distressLevel,
      self_harm_level: distress.selfHarmLevel,
      stage,
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
  });

  return NextResponse.json({
    ok: true,
    conversationId,
    risk,
    distress,
    stage,
    careOffer: distress.offerTherapist,
    reply,
  });
}
