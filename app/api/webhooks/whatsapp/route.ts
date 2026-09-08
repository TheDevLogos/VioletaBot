import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';

import { evaluateRisk } from '@/lib/risk/engine';
import {
  combineDistress,
  evaluateDistress,
  type DistressAssessment,
} from '@/lib/risk/distress';
import {
  generateVioletaReply,
  higherRisk,
  type ChatTurn,
  type RiskLevel,
  type RiskSnapshot,
} from '@/lib/bot/violeta';
import { assessSemanticTriage } from '@/lib/bot/triage';
import {
  alertRiskLevelForCare,
  referralPriorityFor,
  referralTypeFor,
} from '@/lib/care/decisions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  providerMessageId,
  sendReplyButtons,
  sendTypingAndRead,
  sendWhatsApp,
} from '@/lib/whatsapp/send';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ACTIVE_REFERRAL_STATUSES = [
  'offered',
  'consented',
  'queued',
  'assigned',
  'accepted',
  'contacted',
  'in_progress',
  'follow_up',
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function suffix(value: string) {
  return value.slice(-4);
}

function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;

  if (!secret || !header?.startsWith('sha256=')) {
    return false;
  }

  const expected =
    'sha256=' +
    createHmac('sha256', secret)
      .update(raw)
      .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(header);

  return a.length === b.length && timingSafeEqual(a, b);
}

function inboundButton(msg: any) {
  const reply = msg?.interactive?.button_reply;
  if (!reply?.id) return null;

  return {
    id: String(reply.id),
    title: String(reply.title || ''),
  };
}

function inboundText(msg: any) {
  if (msg?.text?.body) {
    return String(msg.text.body).trim();
  }

  const button = inboundButton(msg);
  if (button) return button.title;

  return '';
}

function referralAlertLevel(priority: string) {
  if (priority === 'immediate') return 'critical';
  if (priority === 'urgent') return 'high';
  if (priority === 'priority') return 'medium';
  return 'low';
}

async function storeOutboundText(args: {
  db: any;
  conversationId: string;
  to: string;
  phoneNumberId: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  let response: any = null;
  let providerError: string | null = null;

  try {
    response = await sendWhatsApp(
      args.to,
      args.body,
      args.phoneNumberId
    );

    console.info('[violeta:reply.sent]', {
      conversationId: args.conversationId,
      recipientSuffix: suffix(args.to),
    });
  } catch (error) {
    providerError = errorMessage(error);

    console.error('[violeta:reply.failed]', {
      conversationId: args.conversationId,
      recipientSuffix: suffix(args.to),
      error: providerError,
    });
  }

  const wamid = providerMessageId(response);

  await args.db.from('messages').insert({
    conversation_id: args.conversationId,
    direction: 'outbound',
    message_type: 'text',
    content: args.body,
    provider_message_id: wamid,
    delivery_status: wamid ? 'accepted' : 'failed',
    failed_at: providerError ? new Date().toISOString() : null,
    metadata: {
      ...(args.metadata || {}),
      provider_response: response,
      provider_error: providerError,
    },
  });

  return {
    response,
    providerError,
    providerMessageId: wamid,
  };
}

async function storeOutboundButtons(args: {
  db: any;
  conversationId: string;
  to: string;
  phoneNumberId: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
  metadata?: Record<string, unknown>;
}) {
  let response: any = null;
  let providerError: string | null = null;

  try {
    response = await sendReplyButtons({
      to: args.to,
      phoneNumberId: args.phoneNumberId,
      body: args.body,
      buttons: args.buttons,
    });

    console.info('[violeta:buttons.sent]', {
      conversationId: args.conversationId,
      recipientSuffix: suffix(args.to),
    });
  } catch (error) {
    providerError = errorMessage(error);

    console.error('[violeta:buttons.failed]', {
      conversationId: args.conversationId,
      recipientSuffix: suffix(args.to),
      error: providerError,
    });
  }

  const wamid = providerMessageId(response);

  await args.db.from('messages').insert({
    conversation_id: args.conversationId,
    direction: 'outbound',
    message_type: 'interactive',
    content: args.body,
    provider_message_id: wamid,
    delivery_status: wamid ? 'accepted' : 'failed',
    failed_at: providerError ? new Date().toISOString() : null,
    metadata: {
      ...(args.metadata || {}),
      buttons: args.buttons,
      provider_response: response,
      provider_error: providerError,
    },
  });
}

async function recordReferralEvent(
  db: any,
  referral: any,
  eventType: string,
  note?: string | null,
  metadata?: Record<string, unknown>
) {
  await db.from('referral_events').insert({
    referral_id: referral.id,
    organization_id: referral.organization_id,
    actor_type: 'bot',
    event_type: eventType,
    note: note || null,
    metadata: metadata || {},
  });
}

async function ensureOperatorAlert(args: {
  db: any;
  conversationId: string;
  priority: RiskLevel;
  payload: Record<string, unknown>;
}) {
  const { data: pending } = await args.db
    .from('alerts')
    .select('id')
    .eq('conversation_id', args.conversationId)
    .eq('alert_type', 'operator')
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (pending) return;

  await args.db.from('alerts').insert({
    conversation_id: args.conversationId,
    alert_type: 'operator',
    status: 'pending',
    priority: args.priority,
    payload: args.payload,
  });
}

async function latestReferral(db: any, conversationId: string) {
  const { data } = await db
    .from('referrals')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function handleCareButton(args: {
  db: any;
  org: any;
  conv: any;
  from: string;
  phoneNumberId: string;
  messageId: string;
  button: { id: string; title: string };
}) {
  const {
    db,
    org,
    conv,
    from,
    phoneNumberId,
    messageId,
    button,
  } = args;

  let referral = await latestReferral(db, conv.id);

  if (button.id === 'care_referral_yes') {
    if (!referral || !ACTIVE_REFERRAL_STATUSES.includes(referral.status)) {
      const { data } = await db
        .from('referrals')
        .insert({
          organization_id: org.id,
          conversation_id: conv.id,
          referral_type: 'emotional_support',
          priority: 'priority',
          status: 'offered',
          reason: 'Solicitud expresa de apoyo humano',
          is_test: false,
        })
        .select('*')
        .single();

      referral = data;
    }

    if (referral) {
      await recordReferralEvent(
        db,
        referral,
        'consent_requested',
        'La usuaria solicitó hablar con una terapeuta.'
      );
    }

    await db
      .from('conversations')
      .update({
        conversation_stage: 'waiting_consent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    await storeOutboundButtons({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        'Claro. Para que una terapeuta pueda contactarte necesito compartir con ella tu número de WhatsApp y un resumen breve de lo necesario. ¿Me autorizas?',
      buttons: [
        {
          id: 'care_consent_yes',
          title: 'Sí, autorizo',
        },
        {
          id: 'care_consent_no',
          title: 'Prefiero no',
        },
      ],
      metadata: {
        care_flow: 'consent_request',
        referral_id: referral?.id || null,
      },
    });

    return true;
  }

  if (button.id === 'care_keep_talking' || button.id === 'care_not_now') {
    if (referral?.status === 'offered') {
      await db
        .from('referrals')
        .update({
          status: 'declined',
          updated_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        })
        .eq('id', referral.id);

      await recordReferralEvent(
        db,
        referral,
        button.id === 'care_keep_talking'
          ? 'user_prefers_continue_with_violeta'
          : 'user_declined_for_now'
      );
    }

    await db
      .from('conversations')
      .update({
        conversation_stage: 'supporting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    await storeOutboundText({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        button.id === 'care_keep_talking'
          ? 'Claro. Podemos seguir aquí con calma. Cuéntame qué necesitas que entendamos primero.'
          : 'Está bien. No tienes que decidirlo ahora. Podemos seguir hablando aquí.',
      metadata: {
        care_flow: 'referral_declined',
      },
    });

    return true;
  }

  if (button.id === 'care_consent_yes') {
    if (!referral) {
      const { data } = await db
        .from('referrals')
        .insert({
          organization_id: org.id,
          conversation_id: conv.id,
          referral_type: 'emotional_support',
          priority: 'priority',
          status: 'offered',
          reason: 'Consentimiento recibido sin referencia previa',
          is_test: false,
        })
        .select('*')
        .single();

      referral = data;
    }

    const { data: consent } = await db
      .from('consents')
      .insert({
        conversation_id: conv.id,
        consent_type: 'therapist_referral',
        granted: true,
        evidence: {
          source: 'whatsapp_reply_button',
          message_id: messageId,
          button_id: button.id,
          button_title: button.title,
        },
      })
      .select('id')
      .single();

    if (referral) {
      const now = new Date().toISOString();

      await db
        .from('referrals')
        .update({
          status: 'queued',
          consent_id: consent?.id || null,
          consented_at: now,
          updated_at: now,
        })
        .eq('id', referral.id);

      await recordReferralEvent(
        db,
        referral,
        'consent_granted',
        'Autorizó compartir su número y un resumen mínimo para contacto terapéutico.'
      );

      await ensureOperatorAlert({
        db,
        conversationId: conv.id,
        priority: referralAlertLevel(referral.priority) as RiskLevel,
        payload: {
          kind: 'therapist_referral',
          referral_id: referral.id,
          priority: referral.priority,
        },
      });
    }

    await db
      .from('conversations')
      .update({
        conversation_stage: 'human_handoff',
        last_human_handoff_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    await storeOutboundText({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        'Gracias. Ya quedó tu solicitud para que el equipo revise qué terapeuta está disponible. Mientras tanto podemos seguir hablando aquí; no tienes que quedarte sola con esto.',
      metadata: {
        care_flow: 'consent_granted',
        referral_id: referral?.id || null,
      },
    });

    return true;
  }

  if (button.id === 'care_consent_no') {
    const { data: consent } = await db
      .from('consents')
      .insert({
        conversation_id: conv.id,
        consent_type: 'therapist_referral',
        granted: false,
        evidence: {
          source: 'whatsapp_reply_button',
          message_id: messageId,
          button_id: button.id,
          button_title: button.title,
        },
      })
      .select('id')
      .single();

    if (referral) {
      await db
        .from('referrals')
        .update({
          status: 'declined',
          consent_id: consent?.id || null,
          updated_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        })
        .eq('id', referral.id);

      await recordReferralEvent(
        db,
        referral,
        'consent_declined'
      );
    }

    await db
      .from('conversations')
      .update({
        conversation_stage: 'supporting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    await storeOutboundText({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        'Entiendo. No compartiré tu número con una terapeuta. Podemos seguir hablando aquí y tú decides después si quieres otro tipo de apoyo.',
      metadata: {
        care_flow: 'consent_declined',
      },
    });

    return true;
  }

  return false;
}

async function processMessage(value: any, msg: any) {
  const from = String(msg?.from || '');
  const phoneNumberId = String(
    value?.metadata?.phone_number_id || ''
  );
  const messageId = String(msg?.id || '');

  if (!from || !phoneNumberId || !messageId) {
    return;
  }

  const db = supabaseAdmin();

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select(
      'id,name,bot_name,bot_model,whatsapp_phone_number_id,whatsapp_enabled'
    )
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('whatsapp_enabled', true)
    .maybeSingle();

  if (orgError) throw orgError;
  if (!org) return;

  const { data: duplicate } = await db
    .from('messages')
    .select('id')
    .eq('external_message_id', messageId)
    .maybeSingle();

  if (duplicate) return;

  try {
    await sendTypingAndRead(messageId, phoneNumberId);
  } catch (error) {
    console.warn('[violeta:typing.failed]', {
      error: errorMessage(error),
    });
  }

  let { data: conv, error: convError } = await db
    .from('conversations')
    .select(
      'id,organization_id,recurrence_count,conversation_stage,channel,status'
    )
    .eq('organization_id', org.id)
    .eq('wa_user_id', from)
    .eq('channel', 'whatsapp')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (convError) throw convError;

  if (!conv) {
    const created = await db
      .from('conversations')
      .insert({
        organization_id: org.id,
        wa_user_id: from,
        status: 'open',
        channel: 'whatsapp',
        is_test: false,
        conversation_stage: 'greeting',
        subject_label: `WhatsApp ••••${from.slice(-4)}`,
      })
      .select(
        'id,organization_id,recurrence_count,conversation_stage,channel,status'
      )
      .single();

    if (created.error || !created.data) {
      throw created.error || new Error('No se pudo crear la conversación');
    }

    conv = created.data;
  }

  const button = inboundButton(msg);
  const text = inboundText(msg);
  const location = msg?.location;

  await db.from('messages').insert({
    conversation_id: conv.id,
    external_message_id: messageId,
    direction: 'inbound',
    message_type: location
      ? 'location'
      : button
        ? 'interactive'
        : msg.type || 'text',
    content: location ? null : text || null,
    metadata: location
      ? location
      : {
          whatsapp_type: msg.type,
          button_id: button?.id || null,
          button_title: button?.title || null,
        },
  });

  await db
    .from('conversations')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', conv.id);

  if (button?.id?.startsWith('care_')) {
    const handled = await handleCareButton({
      db,
      org,
      conv,
      from,
      phoneNumberId,
      messageId,
      button,
    });

    if (handled) return;
  }

  if (location) {
    await db.from('locations').insert({
      conversation_id: conv.id,
      latitude: location.latitude,
      longitude: location.longitude,
      source: 'whatsapp',
    });

    await storeOutboundText({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        'Gracias, ya recibí tu ubicación. Si no es seguro seguir escribiendo, no tienes que responder ahora.',
      metadata: {
        location_ack: true,
      },
    });

    return;
  }

  if (!text) {
    await storeOutboundText({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        'Por ahora puedo leerte mejor por texto. Si te es posible, escríbeme con tus palabras qué está pasando.',
      metadata: {
        unsupported_type: msg.type,
      },
    });

    return;
  }

  const [
    previousRiskResult,
    previousDistressResult,
    recentResult,
  ] = await Promise.all([
    db
      .from('risk_events')
      .select('level,score,triggers,categories')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db
      .from('distress_events')
      .select(
        'distress_level,self_harm_level,hopelessness,panic_signals,triggers,created_at'
      )
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db
      .from('messages')
      .select('direction,content')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(16),
  ]);

  const previousRisk = previousRiskResult.data;
  const recent = recentResult.data || [];

  const history: ChatTurn[] = recent
    .reverse()
    .filter((item: any) => item.content)
    .map((item: any) => ({
      role:
        item.direction === 'outbound'
          ? 'assistant'
          : 'user',
      content: String(item.content),
    }));

  const currentRisk = evaluateRisk(
    text,
    conv.recurrence_count || 0
  );

  const risk = higherRisk(
    currentRisk,
    previousRisk as any
  );

  const rulesDistress = evaluateDistress(text);

  const semantic = await assessSemanticTriage({
    history,
    currentText: text,
    model: org.bot_model,
    safetySource: `wa:${org.id}:${from}`,
  });

  const distress = combineDistress(
    rulesDistress,
    semantic
  );

  await Promise.all([
    db.from('risk_events').insert({
      conversation_id: conv.id,
      level: risk.level,
      score: risk.score,
      triggers: risk.triggers,
      categories: risk.categories,
      source_text: text,
    }),

    db.from('distress_events').insert({
      conversation_id: conv.id,
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

  const careAlertLevel = alertRiskLevelForCare(
    risk,
    distress
  );

  if (risk.requiresHuman || distress.needsHuman) {
    await ensureOperatorAlert({
      db,
      conversationId: conv.id,
      priority: careAlertLevel,
      payload: {
        kind: distress.needsHuman
          ? 'care_review'
          : 'violence_review',
        violence: {
          level: risk.level,
          score: risk.score,
        },
        distress: {
          level: distress.distressLevel,
          self_harm_level: distress.selfHarmLevel,
        },
      },
    });
  }

  const latest = await latestReferral(db, conv.id);

  const recentDecline =
    latest &&
    ['declined', 'cancelled'].includes(latest.status) &&
    Date.now() - new Date(latest.created_at).getTime() <
      30 * 60 * 1000;

  const hasActiveReferral =
    latest &&
    ACTIVE_REFERRAL_STATUSES.includes(latest.status);

  const shouldOfferCare =
    distress.offerTherapist &&
    !hasActiveReferral &&
    (!recentDecline || distress.urgent);

  const stage =
    risk.level === 'critical' ||
    distress.selfHarmLevel === 'imminent'
      ? 'crisis'
      : shouldOfferCare
        ? 'referral_offer'
        : distress.distressLevel === 'high' ||
            distress.distressLevel === 'severe'
          ? 'supporting'
          : history.filter((item) => item.role === 'user')
                .length > 2
            ? 'exploring'
            : conv.conversation_stage || 'listening';

  const reply = await generateVioletaReply({
    history,
    risk,
    distress,
    previousRiskLevel:
      (previousRisk?.level as RiskLevel | undefined) ||
      null,
    stage,
    organizationName: org.name,
    botName: org.bot_name,
    model: org.bot_model,
    safetySource: `wa:${org.id}:${from}`,
    careOffer: shouldOfferCare,
  });

  await storeOutboundText({
    db,
    conversationId: conv.id,
    to: from,
    phoneNumberId,
    body: reply,
    metadata: {
      risk_level: risk.level,
      distress_level: distress.distressLevel,
      self_harm_level: distress.selfHarmLevel,
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
  });

  let finalStage = stage;

  if (shouldOfferCare) {
    const referralType = referralTypeFor(
      risk,
      distress
    );

    const priority = referralPriorityFor(
      risk,
      distress
    );

    const { data: referral } = await db
      .from('referrals')
      .insert({
        organization_id: org.id,
        conversation_id: conv.id,
        referral_type: referralType,
        priority,
        status: 'offered',
        reason: distress.triggers.join(', ') || 'Señales de angustia',
        summary:
          'semanticSummary' in distress
            ? distress.semanticSummary || null
            : null,
        is_test: false,
      })
      .select('*')
      .single();

    if (referral) {
      await recordReferralEvent(
        db,
        referral,
        'offered_by_bot',
        'Violeta ofreció apoyo de la Red de Terapeutas.'
      );
    }

    await storeOutboundButtons({
      db,
      conversationId: conv.id,
      to: from,
      phoneNumberId,
      body:
        distress.selfHarmLevel === 'high' ||
        distress.selfHarmLevel === 'imminent'
          ? 'Si quieres, puedo ayudarte a pedir apoyo humano de una terapeuta de la Red 24/7. ¿Qué prefieres?'
          : 'Si quieres, también puedo ayudarte a pedir apoyo de una terapeuta disponible de la Red 24/7. ¿Qué prefieres?',
      buttons: [
        {
          id: 'care_referral_yes',
          title: 'Hablar con terapeuta',
        },
        {
          id: 'care_keep_talking',
          title: 'Seguir aquí',
        },
        {
          id: 'care_not_now',
          title: 'Ahora no',
        },
      ],
      metadata: {
        care_flow: 'referral_offer',
        referral_id: referral?.id || null,
      },
    });

    finalStage = 'referral_offer';
  }

  await db
    .from('conversations')
    .update({
      conversation_stage: finalStage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conv.id);

  await db.from('audit_logs').insert({
    organization_id: org.id,
    action: 'whatsapp.message_processed',
    entity_type: 'conversation',
    entity_id: conv.id,
    metadata: {
      risk_level: risk.level,
      score: risk.score,
      distress_level: distress.distressLevel,
      self_harm_level: distress.selfHarmLevel,
      stage: finalStage,
      care_offer: shouldOfferCare,
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
  });

  console.info('[violeta:message.complete]', {
    conversationId: conv.id,
    violence: risk.level,
    distress: distress.distressLevel,
    selfHarm: distress.selfHarmLevel,
    stage: finalStage,
  });
}

async function processStatuses(payload: any) {
  const db = supabaseAdmin();

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const status of change?.value?.statuses || []) {
        const providerId = String(status?.id || '');
        const state = String(status?.status || '');

        if (!providerId || !state) continue;

        const patch: Record<string, unknown> = {
          delivery_status: state,
        };

        if (state === 'delivered') {
          patch.delivered_at = new Date().toISOString();
        }

        if (state === 'read') {
          patch.read_at = new Date().toISOString();
        }

        if (state === 'failed') {
          patch.failed_at = new Date().toISOString();

          console.error('[violeta:delivery.failed]', {
            providerMessageIdSuffix: providerId.slice(-12),
            errors: status?.errors || null,
          });
        }

        await db
          .from('messages')
          .update(patch)
          .eq('provider_message_id', providerId);
      }
    }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (
    mode === 'subscribe' &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(challenge || '', {
      status: 200,
    });
  }

  return new Response('Forbidden', {
    status: 403,
  });
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (
    !validSignature(
      raw,
      req.headers.get('x-hub-signature-256')
    )
  ) {
    console.warn('[violeta:webhook.invalid_signature]');
    return new Response('Invalid signature', {
      status: 401,
    });
  }

  let payload: any;

  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_json',
      },
      {
        status: 400,
      }
    );
  }

  const work: Array<{
    value: any;
    msg: any;
  }> = [];

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;

      for (const msg of value?.messages || []) {
        work.push({
          value,
          msg,
        });
      }
    }
  }

  // Respondemos a Meta inmediatamente.
  // Los eventos de estado también se procesan, pero sin llenar Vercel de logs.
  after(async () => {
    try {
      await processStatuses(payload);

      for (const item of work) {
        try {
          await processMessage(
            item.value,
            item.msg
          );
        } catch (error) {
          console.error('[violeta:message.failed]', {
            error: errorMessage(error),
          });
        }
      }
    } catch (error) {
      console.error('[violeta:webhook.background_failed]', {
        error: errorMessage(error),
      });
    }
  });

  return NextResponse.json({
    ok: true,
    accepted: work.length,
  });
}
