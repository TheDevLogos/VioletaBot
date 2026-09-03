import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { evaluateRisk } from '@/lib/risk/engine';
import { generateVioletaReply, higherRisk, type ChatTurn, type RiskLevel } from '@/lib/bot/violeta';
import { getStaffContext } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const ctx = await getStaffContext();
  if (!ctx || !ctx.active || !ctx.organizationId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!['super_admin', 'admin', 'supervisor', 'operator'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Sin permiso para simular' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  if (!text || text.length > 5000) return NextResponse.json({ error: 'Mensaje inválido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: org } = await db.from('organizations').select('name,bot_name,bot_model').eq('id', ctx.organizationId).maybeSingle();

  let conversationId = String(body.conversationId || '');
  let conv: any = null;

  if (conversationId) {
    const { data } = await db.from('conversations').select('id,organization_id,recurrence_count,channel').eq('id', conversationId).maybeSingle();
    if (data?.organization_id === ctx.organizationId && data.channel === 'simulator') conv = data;
  }

  if (!conv) {
    const now = new Date();
    const label = `Simulación ${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    const created = await db.from('conversations').insert({
      organization_id: ctx.organizationId,
      wa_user_id: `SIM-${randomUUID()}`,
      status: 'open',
      channel: 'simulator',
      is_test: true,
      subject_label: label,
    }).select('id,organization_id,recurrence_count,channel').single();

    if (created.error || !created.data) return NextResponse.json({ error: 'No se pudo crear la simulación' }, { status: 500 });
    conv = created.data;
    conversationId = conv.id;
  }

  const { data: previousEvent } = await db.from('risk_events')
    .select('level,score,triggers,categories')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();

  await db.from('messages').insert({
    conversation_id: conversationId,
    direction: 'inbound',
    message_type: 'text',
    content: text,
    metadata: { simulator: true, created_by: ctx.userId },
  });

  const currentRisk = evaluateRisk(text, conv.recurrence_count || 0);
  const risk = higherRisk(currentRisk, previousEvent as any);

  await db.from('risk_events').insert({
    conversation_id: conversationId,
    level: risk.level,
    score: risk.score,
    triggers: risk.triggers,
    categories: risk.categories,
    source_text: text,
  });

  const { data: recent } = await db.from('messages')
    .select('direction,content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(14);

  const history: ChatTurn[] = (recent || []).reverse().filter((m: any) => m.content).map((m: any) => ({
    role: m.direction === 'outbound' ? 'assistant' : 'user',
    content: String(m.content),
  }));

  const reply = await generateVioletaReply({
    history,
    risk,
    previousRiskLevel: (previousEvent?.level as RiskLevel | undefined) || null,
    organizationName: org?.name,
    botName: org?.bot_name,
    model: org?.bot_model,
    safetySource: `sim:${ctx.userId}:${conversationId}`,
  });

  await db.from('messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    message_type: 'text',
    content: reply,
    metadata: { simulator: true, risk_level: risk.level, ai: Boolean(process.env.OPENAI_API_KEY) },
  });

  if (risk.requiresHuman) {
    const { data: pending } = await db.from('alerts').select('id')
      .eq('conversation_id', conversationId)
      .eq('alert_type', 'operator')
      .eq('status', 'pending')
      .limit(1).maybeSingle();

    if (!pending) {
      await db.from('alerts').insert({
        conversation_id: conversationId,
        alert_type: 'operator',
        status: 'pending',
        priority: risk.level,
        payload: { simulation: true, risk },
      });
    }
  }

  await db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  await db.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.userId,
    action: 'simulator.message_evaluated',
    entity_type: 'conversation',
    entity_id: conversationId,
    metadata: { risk_level: risk.level, score: risk.score, ai: Boolean(process.env.OPENAI_API_KEY) },
  });

  return NextResponse.json({ ok: true, conversationId, risk, reply });
}
