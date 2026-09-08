import { normalizeWhatsAppRecipient } from '@/lib/whatsapp/phone';

function graphVersion() {
  return process.env.META_GRAPH_VERSION || 'v25.0';
}

function whatsappToken() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token) {
    throw new Error('WHATSAPP_ACCESS_TOKEN not configured');
  }

  return token;
}

async function graphPost(
  phoneNumberId: string,
  payload: unknown
) {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `WhatsApp error ${response.status}: ${JSON.stringify(data).slice(0, 700)}`
    );
  }

  return data;
}

export function providerMessageId(response: any) {
  const id = response?.messages?.[0]?.id;
  return typeof id === 'string' ? id : null;
}

export async function sendWhatsApp(
  to: string,
  body: string,
  phoneNumberId?: string | null
) {
  const id =
    phoneNumberId ||
    process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!id) {
    throw new Error(
      'WhatsApp phone number ID not configured'
    );
  }

  const recipient =
    normalizeWhatsAppRecipient(to);

  return graphPost(id, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: {
      preview_url: false,
      body: body.slice(0, 4096),
    },
  });
}

export async function sendReplyButtons(args: {
  to: string;
  phoneNumberId: string;
  body: string;
  buttons: Array<{
    id: string;
    title: string;
  }>;
}) {
  const recipient =
    normalizeWhatsAppRecipient(args.to);

  const buttons = args.buttons
    .slice(0, 3)
    .map((button) => ({
      type: 'reply',
      reply: {
        id: button.id.slice(0, 256),
        title: button.title.slice(0, 20),
      },
    }));

  return graphPost(args.phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: args.body.slice(0, 1024),
      },
      action: {
        buttons,
      },
    },
  });
}

export async function sendTypingAndRead(
  messageId: string,
  phoneNumberId: string
) {
  return graphPost(phoneNumberId, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: {
      type: 'text',
    },
  });
}
