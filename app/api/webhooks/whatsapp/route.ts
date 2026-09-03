import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { evaluateRisk } from '@/lib/risk/engine';
import { generateVioletaReply, higherRisk, type ChatTurn, type RiskLevel } from '@/lib/bot/violeta';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTypingAndRead, sendWhatsApp } from '@/lib/whatsapp/send';

export const runtime = 'nodejs';
export const maxDuration = 30;

function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get('hub.mode');
  const token = u.searchParams.get('hub.verify_token');
  const challenge = u.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

async function processMessage(value: any, msg: any) {
  const from = String(msg?.from || '');
  const phoneNumberId = String(value?.metadata?.phone_number_id || '');
  if (!from || !phoneNumberId || !msg?.id) return;

  const db = supabaseAdmin();
  const { data: org } = await db.from('organizations')
    .select('id,name,bot_name,bot_model,whatsapp_phone_number_id,whatsapp_enabled')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('whatsapp_enabled', true)
    .maybeSingle();

  if (!org) return;

  const exists = await db.from('messages').select('id').eq('external_message_id', msg.id).maybeSingle();
  if (exists.data) return;

  await sendTypingAndRead(msg.id, phoneNumberId).catch(() => null);

  let { data: conv } = await db.from('conversations')
    .select('id,recurrence_count')
    .eq('organization_id', org.id)
    .eq('wa_user_id', from)
    .eq('channel', 'whatsapp')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) {
    const created = await db.from('conversations').insert({
      organization_id: org.id,
      wa_user_id: from,
      status: 'open',
      channel: 'whatsapp',
      is_test: false,
      subject_label: `WhatsApp ••••${from.slice(-4)}`,
    }).select('id,recurrence_count').single();
    conv = created.data;
  }
  if (!conv) return;

  const location = msg.location;
  const text = msg.text?.body ? String(msg.text.body).trim() : '';

  await db.from('messages').insert({
    conversation_id: conv.id,
    external_message_id: msg.id,
    direction: 'inbound',
    message_type: location ? 'location' : (msg.type || 'text'),
    content: text || null,
    metadata: location || { whatsapp_type: msg.type },
  });

  await db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conv.id);

  const { data: previousEvent } = await db.from('risk_events')
    .select('level,score,triggers,categories')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();

  if (location) {
    await db.from('locations').insert({
      conversation_id: conv.id,
      latitude: location.latitude,
      longitude: location.longitude,
      source: 'whatsapp',
    });

    const reply = 'Gracias, ya recibí tu ubicación. Si no es seguro seguir escribiendo, no tienes que responder ahora.';
    const sent = await sendWhatsApp(from, reply, phoneNumberId).catch(() => null);
    await db.from('messages').insert({
      conversation_id: conv.id,
      direction: 'outbound',
      message_type: 'text',
      content: reply,
      metadata: { provider_response: sent, location_ack: true },
    });
    return;
  }

  if (!text) {
    const reply = 'Puedo leerte mejor por mensaje de texto por ahora. Si te es posible, escríbeme con tus palabras qué necesitas o qué está pasando.';
    const sent = await sendWhatsApp(from, reply, phoneNumberId).catch(() => null);
    await db.from('messages').insert({
      conversation_id: conv.id,
      direction: 'outbound',
      message_type: 'text',
      content: reply,
      metadata: { provider_response: sent, unsupported_type: msg.type },
    });
    return;
  }

  const currentRisk = evaluateRisk(text, conv.recurrence_count || 0);
  const risk = higherRisk(currentRisk, previousEvent as any);

  await db.from('risk_events').insert({
    conversation_id: conv.id,
    level: risk.level,
    score: risk.score,
    triggers: risk.triggers,
    categories: risk.categories,
    source_text: text,
  });

  const { data: recent } = await db.from('messages')
    .select('direction,content')
    .eq('conversation_id', conv.id)
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
    organizationName: org.name,
    botName: org.bot_name,
    model: org.bot_model,
    safetySource: `wa:${org.id}:${from}`,
  });

  const sent = await sendWhatsApp(from, reply, phoneNumberId).catch(() => null);

  await db.from('messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    message_type: 'text',
    content: reply,
    metadata: {
      risk_level: risk.level,
      ai: Boolean(process.env.OPENAI_API_KEY),
      provider_response: sent,
    },
  });

  if (risk.requiresHuman) {
    const { data: pending } = await db.from('alerts').select('id')
      .eq('conversation_id', conv.id)
      .eq('alert_type', 'operator')
      .eq('status', 'pending')
      .limit(1).maybeSingle();

    if (!pending) {
      await db.from('alerts').insert({
        conversation_id: conv.id,
        alert_type: 'operator',
        status: 'pending',
        priority: risk.level,
        payload: { risk, source: 'whatsapp' },
      });
    }
  }

  await db.from('audit_logs').insert({
    organization_id: org.id,
    action: 'whatsapp.message_processed',
    entity_type: 'conversation',
    entity_id: conv.id,
    metadata: { risk_level: risk.level, score: risk.score, message_id: msg.id, ai: Boolean(process.env.OPENAI_API_KEY) },
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  const payload = JSON.parse(raw);
  const work: Array<{ value: any; msg: any }> = [];

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      for (const msg of value?.messages || []) work.push({ value, msg });
    }
  }

  if (!work.length) return NextResponse.json({ ok: true, ignored: true });

  after(async () => {
    for (const item of work) {
      try {
        await processMessage(item.value, item.msg);
      } catch (error) {
        console.error('WhatsApp processing error', error);
      }
    }
  });

  return NextResponse.json({ ok: true, accepted: work.length });
}
