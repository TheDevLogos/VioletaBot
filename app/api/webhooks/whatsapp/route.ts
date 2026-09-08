import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';

import { evaluateRisk } from '@/lib/risk/engine';
import {
  generateVioletaReply,
  higherRisk,
  type ChatTurn,
  type RiskLevel,
} from '@/lib/bot/violeta';

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  sendTypingAndRead,
  sendWhatsApp,
} from '@/lib/whatsapp/send';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Convierte cualquier error a texto sin imprimir objetos completos
 * que pudieran contener información sensible.
 */
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Solo usamos los últimos 4 dígitos para diagnóstico.
 * No imprimimos el teléfono completo en logs.
 */
function recipientSuffix(value: string) {
  return value.slice(-4);
}

/**
 * Valida que el POST realmente provenga de Meta.
 */
function validSignature(
  raw: string,
  header: string | null
) {
  const secret = process.env.META_APP_SECRET;

  if (
    !secret ||
    !header?.startsWith('sha256=')
  ) {
    return false;
  }

  const expected =
    'sha256=' +
    createHmac('sha256', secret)
      .update(raw)
      .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(header);

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

/**
 * Envía una respuesta a WhatsApp sin ocultar errores.
 *
 * No hacemos throw deliberadamente después del error
 * porque queremos poder guardar en Supabase que Violeta
 * generó una respuesta aunque Meta no haya podido entregarla.
 */
async function sendReplySafely(args: {
  to: string;
  body: string;
  phoneNumberId: string;
  context: string;
}) {
  const {
    to,
    body,
    phoneNumberId,
    context,
  } = args;

  try {
    const response = await sendWhatsApp(
      to,
      body,
      phoneNumberId
    );

    console.info(
      '[violeta:whatsapp:sent]',
      {
        context,
        recipientSuffix:
          recipientSuffix(to),
        phoneNumberId,
      }
    );

    return {
      providerResponse: response,
      providerError: null,
    };
  } catch (error) {
    const message =
      errorMessage(error);

    console.error(
      '[violeta:whatsapp:send_failed]',
      {
        context,
        recipientSuffix:
          recipientSuffix(to),
        phoneNumberId,
        error: message,
      }
    );

    return {
      providerResponse: null,
      providerError: message,
    };
  }
}

/**
 * Meta usa esta llamada GET únicamente durante
 * la verificación inicial del webhook.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const mode =
    url.searchParams.get('hub.mode');

  const token =
    url.searchParams.get(
      'hub.verify_token'
    );

  const challenge =
    url.searchParams.get(
      'hub.challenge'
    );

  if (
    mode === 'subscribe' &&
    token ===
      process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    console.info(
      '[violeta:webhook:verification_ok]'
    );

    return new Response(
      challenge || '',
      {
        status: 200,
      }
    );
  }

  console.warn(
    '[violeta:webhook:verification_failed]'
  );

  return new Response(
    'Forbidden',
    {
      status: 403,
    }
  );
}

async function processMessage(
  value: any,
  msg: any
) {
  const from =
    String(msg?.from || '');

  const phoneNumberId =
    String(
      value?.metadata
        ?.phone_number_id || ''
    );

  const messageId =
    String(msg?.id || '');

  console.info(
    '[violeta:webhook:message_received]',
    {
      phoneNumberId,
      recipientSuffix:
        recipientSuffix(from),
      messageType:
        msg?.type || 'unknown',
      hasMessageId:
        Boolean(messageId),
    }
  );

  if (
    !from ||
    !phoneNumberId ||
    !messageId
  ) {
    console.warn(
      '[violeta:webhook:invalid_message]',
      {
        hasFrom: Boolean(from),
        hasPhoneNumberId:
          Boolean(phoneNumberId),
        hasMessageId:
          Boolean(messageId),
      }
    );

    return;
  }

  const db = supabaseAdmin();

  /**
   * 1. Identificar la organización
   * por Phone Number ID.
   */
  const {
    data: org,
    error: orgError,
  } = await db
    .from('organizations')
    .select(
      [
        'id',
        'name',
        'bot_name',
        'bot_model',
        'whatsapp_phone_number_id',
        'whatsapp_enabled',
      ].join(',')
    )
    .eq(
      'whatsapp_phone_number_id',
      phoneNumberId
    )
    .eq(
      'whatsapp_enabled',
      true
    )
    .maybeSingle();

  if (orgError) {
    console.error(
      '[violeta:webhook:organization_lookup_failed]',
      {
        phoneNumberId,
        error:
          orgError.message,
      }
    );

    throw orgError;
  }

  if (!org) {
    console.warn(
      '[violeta:webhook:organization_not_found]',
      {
        phoneNumberId,
      }
    );

    return;
  }

  console.info(
    '[violeta:webhook:organization_found]',
    {
      organizationId:
        org.id,
      phoneNumberId,
    }
  );

  /**
   * 2. Protección contra mensajes duplicados.
   */
  const {
    data: existingMessage,
    error: duplicateCheckError,
  } = await db
    .from('messages')
    .select('id')
    .eq(
      'external_message_id',
      messageId
    )
    .maybeSingle();

  if (duplicateCheckError) {
    console.error(
      '[violeta:webhook:duplicate_check_failed]',
      {
        error:
          duplicateCheckError.message,
      }
    );

    throw duplicateCheckError;
  }

  if (existingMessage) {
    console.info(
      '[violeta:webhook:duplicate_ignored]',
      {
        messageIdSuffix:
          messageId.slice(-12),
      }
    );

    return;
  }

  /**
   * 3. Marcar como leído + typing indicator.
   *
   * Si falla no bloqueamos el procesamiento,
   * pero ahora sí lo registramos.
   */
  try {
    await sendTypingAndRead(
      messageId,
      phoneNumberId
    );

    console.info(
      '[violeta:whatsapp:typing_sent]',
      {
        phoneNumberId,
      }
    );
  } catch (error) {
    console.warn(
      '[violeta:whatsapp:typing_failed]',
      {
        phoneNumberId,
        error:
          errorMessage(error),
      }
    );
  }

  /**
   * 4. Buscar conversación abierta.
   */
  const {
    data: existingConversation,
    error: conversationLookupError,
  } = await db
    .from('conversations')
    .select(
      'id,recurrence_count'
    )
    .eq(
      'organization_id',
      org.id
    )
    .eq(
      'wa_user_id',
      from
    )
    .eq(
      'channel',
      'whatsapp'
    )
    .eq(
      'status',
      'open'
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (conversationLookupError) {
    console.error(
      '[violeta:webhook:conversation_lookup_failed]',
      {
        organizationId:
          org.id,
        error:
          conversationLookupError.message,
      }
    );

    throw conversationLookupError;
  }

  let conv =
    existingConversation;

  /**
   * 5. Crear conversación si no existe.
   */
  if (!conv) {
    const {
      data: createdConversation,
      error: createConversationError,
    } = await db
      .from('conversations')
      .insert({
        organization_id:
          org.id,

        wa_user_id:
          from,

        status:
          'open',

        channel:
          'whatsapp',

        is_test:
          false,

        subject_label:
          `WhatsApp ••••${from.slice(-4)}`,
      })
      .select(
        'id,recurrence_count'
      )
      .single();

    if (
      createConversationError ||
      !createdConversation
    ) {
      console.error(
        '[violeta:webhook:conversation_create_failed]',
        {
          organizationId:
            org.id,
          error:
            createConversationError
              ?.message ||
            'No conversation returned',
        }
      );

      throw (
        createConversationError ||
        new Error(
          'Conversation creation failed'
        )
      );
    }

    conv =
      createdConversation;

    console.info(
      '[violeta:webhook:conversation_created]',
      {
        conversationId:
          conv.id,
        organizationId:
          org.id,
      }
    );
  } else {
    console.info(
      '[violeta:webhook:conversation_found]',
      {
        conversationId:
          conv.id,
      }
    );
  }

  const location =
    msg.location;

  const text =
    msg.text?.body
      ? String(
          msg.text.body
        ).trim()
      : '';

  /**
   * 6. Persistir mensaje entrante.
   */
  const {
    error: inboundInsertError,
  } = await db
    .from('messages')
    .insert({
      conversation_id:
        conv.id,

      external_message_id:
        messageId,

      direction:
        'inbound',

      message_type:
        location
          ? 'location'
          : msg.type ||
            'text',

      content:
        text || null,

      metadata:
        location || {
          whatsapp_type:
            msg.type,
        },
    });

  if (inboundInsertError) {
    console.error(
      '[violeta:webhook:inbound_persist_failed]',
      {
        conversationId:
          conv.id,
        error:
          inboundInsertError.message,
      }
    );

    throw inboundInsertError;
  }

  console.info(
    '[violeta:webhook:inbound_persisted]',
    {
      conversationId:
        conv.id,
      messageType:
        location
          ? 'location'
          : msg.type,
    }
  );

  await db
    .from('conversations')
    .update({
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'id',
      conv.id
    );

  /**
   * 7. Obtener último riesgo conocido.
   */
  const {
    data: previousEvent,
    error: previousRiskError,
  } = await db
    .from('risk_events')
    .select(
      'level,score,triggers,categories'
    )
    .eq(
      'conversation_id',
      conv.id
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (previousRiskError) {
    console.warn(
      '[violeta:risk:previous_lookup_failed]',
      {
        conversationId:
          conv.id,
        error:
          previousRiskError.message,
      }
    );
  }

  /**
   * 8. Si la persona compartió ubicación.
   */
  if (location) {
    const {
      error: locationInsertError,
    } = await db
      .from('locations')
      .insert({
        conversation_id:
          conv.id,

        latitude:
          location.latitude,

        longitude:
          location.longitude,

        source:
          'whatsapp',
      });

    if (locationInsertError) {
      console.error(
        '[violeta:location:persist_failed]',
        {
          conversationId:
            conv.id,
          error:
            locationInsertError.message,
        }
      );

      throw locationInsertError;
    }

    const reply =
      'Gracias, ya recibí tu ubicación. Si no es seguro seguir escribiendo, no tienes que responder ahora.';

    const {
      providerResponse,
      providerError,
    } =
      await sendReplySafely({
        to: from,
        body: reply,
        phoneNumberId,
        context:
          'location_ack',
      });

    const {
      error: outboundLocationError,
    } = await db
      .from('messages')
      .insert({
        conversation_id:
          conv.id,

        direction:
          'outbound',

        message_type:
          'text',

        content:
          reply,

        metadata: {
          provider_response:
            providerResponse,

          provider_error:
            providerError,

          location_ack:
            true,
        },
      });

    if (outboundLocationError) {
      console.error(
        '[violeta:webhook:outbound_persist_failed]',
        {
          conversationId:
            conv.id,
          context:
            'location_ack',
          error:
            outboundLocationError.message,
        }
      );
    }

    return;
  }

  /**
   * 9. Tipo de mensaje todavía no compatible.
   */
  if (!text) {
    const reply =
      'Puedo leerte mejor por mensaje de texto por ahora. Si te es posible, escríbeme con tus palabras qué necesitas o qué está pasando.';

    const {
      providerResponse,
      providerError,
    } =
      await sendReplySafely({
        to: from,
        body: reply,
        phoneNumberId,
        context:
          'unsupported_message_type',
      });

    const {
      error: unsupportedPersistError,
    } = await db
      .from('messages')
      .insert({
        conversation_id:
          conv.id,

        direction:
          'outbound',

        message_type:
          'text',

        content:
          reply,

        metadata: {
          provider_response:
            providerResponse,

          provider_error:
            providerError,

          unsupported_type:
            msg.type,
        },
      });

    if (unsupportedPersistError) {
      console.error(
        '[violeta:webhook:outbound_persist_failed]',
        {
          conversationId:
            conv.id,
          context:
            'unsupported_message_type',
          error:
            unsupportedPersistError.message,
        }
      );
    }

    return;
  }

  /**
   * 10. Motor determinístico de riesgo.
   */
  const currentRisk =
    evaluateRisk(
      text,
      conv.recurrence_count ||
        0
    );

  const risk =
    higherRisk(
      currentRisk,
      previousEvent as any
    );

  const {
    error: riskInsertError,
  } = await db
    .from('risk_events')
    .insert({
      conversation_id:
        conv.id,

      level:
        risk.level,

      score:
        risk.score,

      triggers:
        risk.triggers,

      categories:
        risk.categories,

      source_text:
        text,
    });

  if (riskInsertError) {
    console.error(
      '[violeta:risk:persist_failed]',
      {
        conversationId:
          conv.id,
        error:
          riskInsertError.message,
      }
    );

    throw riskInsertError;
  }

  console.info(
    '[violeta:risk:evaluated]',
    {
      conversationId:
        conv.id,

      level:
        risk.level,

      score:
        risk.score,

      requiresHuman:
        risk.requiresHuman,
    }
  );

  /**
   * 11. Historial reciente.
   */
  const {
    data: recent,
    error: recentMessagesError,
  } = await db
    .from('messages')
    .select(
      'direction,content'
    )
    .eq(
      'conversation_id',
      conv.id
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(14);

  if (recentMessagesError) {
    console.error(
      '[violeta:conversation:history_failed]',
      {
        conversationId:
          conv.id,
        error:
          recentMessagesError.message,
      }
    );

    throw recentMessagesError;
  }

  const history: ChatTurn[] =
    (recent || [])
      .reverse()
      .filter(
        (m: any) =>
          m.content
      )
      .map(
        (m: any) => ({
          role:
            m.direction ===
            'outbound'
              ? 'assistant'
              : 'user',

          content:
            String(
              m.content
            ),
        })
      );

  /**
   * 12. Generar respuesta natural.
   */
  console.info(
    '[violeta:ai:generation_started]',
    {
      conversationId:
        conv.id,
      historyTurns:
        history.length,
      riskLevel:
        risk.level,
    }
  );

  const reply =
    await generateVioletaReply({
      history,

      risk,

      previousRiskLevel:
        (
          previousEvent?.level as
            | RiskLevel
            | undefined
        ) || null,

      organizationName:
        org.name,

      botName:
        org.bot_name,

      model:
        org.bot_model,

      safetySource:
        `wa:${org.id}:${from}`,
    });

  console.info(
    '[violeta:ai:reply_generated]',
    {
      conversationId:
        conv.id,
      replyLength:
        reply.length,
    }
  );

  /**
   * 13. Enviar respuesta a WhatsApp.
   *
   * Aquí ya NO ocultamos errores.
   */
  const {
    providerResponse,
    providerError,
  } =
    await sendReplySafely({
      to: from,
      body: reply,
      phoneNumberId,
      context:
        'conversation_reply',
    });

  /**
   * 14. Guardar respuesta generada +
   * resultado real del proveedor.
   */
  const {
    error: outboundInsertError,
  } = await db
    .from('messages')
    .insert({
      conversation_id:
        conv.id,

      direction:
        'outbound',

      message_type:
        'text',

      content:
        reply,

      metadata: {
        risk_level:
          risk.level,

        ai:
          Boolean(
            process.env
              .OPENAI_API_KEY
          ),

        provider_response:
          providerResponse,

        provider_error:
          providerError,
      },
    });

  if (outboundInsertError) {
    console.error(
      '[violeta:webhook:outbound_persist_failed]',
      {
        conversationId:
          conv.id,
        error:
          outboundInsertError.message,
      }
    );

    throw outboundInsertError;
  }

  /**
   * 15. Crear alerta humana si aplica.
   */
  if (risk.requiresHuman) {
    const {
      data: pending,
      error: pendingAlertError,
    } = await db
      .from('alerts')
      .select('id')
      .eq(
        'conversation_id',
        conv.id
      )
      .eq(
        'alert_type',
        'operator'
      )
      .eq(
        'status',
        'pending'
      )
      .limit(1)
      .maybeSingle();

    if (pendingAlertError) {
      console.error(
        '[violeta:alert:lookup_failed]',
        {
          conversationId:
            conv.id,
          error:
            pendingAlertError.message,
        }
      );
    }

    if (!pending) {
      const {
        error: alertInsertError,
      } = await db
        .from('alerts')
        .insert({
          conversation_id:
            conv.id,

          alert_type:
            'operator',

          status:
            'pending',

          priority:
            risk.level,

          payload: {
            risk,
            source:
              'whatsapp',
          },
        });

      if (alertInsertError) {
        console.error(
          '[violeta:alert:create_failed]',
          {
            conversationId:
              conv.id,
            error:
              alertInsertError.message,
          }
        );
      } else {
        console.info(
          '[violeta:alert:created]',
          {
            conversationId:
              conv.id,
            priority:
              risk.level,
          }
        );
      }
    }
  }

  /**
   * 16. Auditoría.
   */
  const {
    error: auditError,
  } = await db
    .from('audit_logs')
    .insert({
      organization_id:
        org.id,

      action:
        'whatsapp.message_processed',

      entity_type:
        'conversation',

      entity_id:
        conv.id,

      metadata: {
        risk_level:
          risk.level,

        score:
          risk.score,

        message_id:
          messageId,

        ai:
          Boolean(
            process.env
              .OPENAI_API_KEY
          ),

        whatsapp_delivered_to_provider:
          Boolean(
            providerResponse
          ),

        whatsapp_provider_error:
          providerError,
      },
    });

  if (auditError) {
    console.warn(
      '[violeta:audit:persist_failed]',
      {
        conversationId:
          conv.id,
        error:
          auditError.message,
      }
    );
  }

  console.info(
    '[violeta:webhook:processing_complete]',
    {
      conversationId:
        conv.id,

      riskLevel:
        risk.level,

      whatsappAccepted:
        Boolean(
          providerResponse
        ),
    }
  );
}

/**
 * Webhook POST de Meta.
 */
export async function POST(
  req: Request
) {
  const raw =
    await req.text();

  /**
   * Verificación criptográfica del origen.
   */
  if (
    !validSignature(
      raw,
      req.headers.get(
        'x-hub-signature-256'
      )
    )
  ) {
    console.warn(
      '[violeta:webhook:invalid_signature]'
    );

    return new Response(
      'Invalid signature',
      {
        status: 401,
      }
    );
  }

  console.info(
    '[violeta:webhook:signature_valid]'
  );

  let payload: any;

  try {
    payload =
      JSON.parse(raw);
  } catch (error) {
    console.error(
      '[violeta:webhook:invalid_json]',
      {
        error:
          errorMessage(error),
      }
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'invalid_json',
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

  for (
    const entry of
    payload?.entry || []
  ) {
    for (
      const change of
      entry?.changes || []
    ) {
      const value =
        change?.value;

      for (
        const msg of
        value?.messages || []
      ) {
        work.push({
          value,
          msg,
        });
      }
    }
  }

  /**
   * Meta también envía eventos de estados de mensajes.
   * Si no hay messages, los ignoramos correctamente.
   */
  if (!work.length) {
    console.info(
      '[violeta:webhook:event_ignored]',
      {
        reason:
          'no_messages',
      }
    );

    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  console.info(
    '[violeta:webhook:accepted]',
    {
      messageCount:
        work.length,
    }
  );

  /**
   * Contestamos inmediatamente 200 a Meta.
   * El procesamiento continúa después.
   */
  after(async () => {
    for (
      const item of work
    ) {
      try {
        await processMessage(
          item.value,
          item.msg
        );
      } catch (error) {
        console.error(
          '[violeta:webhook:processing_failed]',
          {
            error:
              errorMessage(error),
          }
        );
      }
    }
  });

  return NextResponse.json({
    ok: true,
    accepted:
      work.length,
  });
}
