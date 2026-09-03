function graphVersion() {
  return process.env.META_GRAPH_VERSION || 'v26.0';
}

function whatsappToken() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not configured');
  return token;
}

async function graphPost(phoneNumberId: string, payload: unknown) {
  const r = await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp error ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

export async function sendWhatsApp(to: string, body: string, phoneNumberId?: string | null) {
  const id = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error('WhatsApp phone number ID not configured');
  return graphPost(id, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: body.slice(0, 4096) },
  });
}

export async function sendTypingAndRead(messageId: string, phoneNumberId: string) {
  return graphPost(phoneNumberId, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: { type: 'text' },
  });
}
