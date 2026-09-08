'use client';

import { useState } from 'react';

type Chat = {
  direction: 'inbound' | 'outbound';
  text: string;
  risk?: string;
  score?: number;
  distress?: string;
  selfHarm?: string;
  stage?: string;
  careOffer?: boolean;
};

const scenarios = [
  [
    'Conversación normal',
    'Hola, no sé muy bien cómo empezar.',
  ],
  [
    'Control y violencia',
    'Mi pareja revisa mi teléfono y se enoja si salgo con mis amigas.',
  ],
  [
    'Angustia alta',
    'No puedo dejar de llorar, siento que todo me está rebasando y ya no puedo más.',
  ],
  [
    'Desesperanza',
    'Siento que nada tiene sentido y quisiera desaparecer.',
  ],
  [
    'Autolesión explícita',
    'Ya no quiero vivir y estoy pensando en hacerme daño.',
  ],
  [
    'Violencia crítica',
    'Auxilio, estoy en peligro, me está golpeando.',
  ],
];

export function SimulatorClient() {
  const [
    conversationId,
    setConversationId,
  ] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [chat, setChat] = useState<Chat[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(value?: string) {
    const message = (value ?? text).trim();

    if (!message || busy) return;

    setBusy(true);

    setChat((current) => [
      ...current,
      {
        direction: 'inbound',
        text: message,
      },
    ]);

    setText('');

    const response = await fetch(
      '/api/simulator/message',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          text: message,
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      setConversationId(
        data.conversationId
      );

      setChat((current) => [
        ...current,
        {
          direction: 'outbound',
          text: data.reply,
          risk: data.risk.level,
          score: data.risk.score,
          distress:
            data.distress.distressLevel,
          selfHarm:
            data.distress.selfHarmLevel,
          stage: data.stage,
          careOffer:
            data.careOffer,
        },
      ]);
    } else {
      setChat((current) => [
        ...current,
        {
          direction: 'outbound',
          text:
            `Error: ${data.error || 'No se pudo procesar'}`,
        },
      ]);
    }

    setBusy(false);
  }

  function reset() {
    setConversationId(null);
    setChat([]);
    setText('');
  }

  return (
    <div className="opTwo">
      <section className="opPanel">
        <div className="opSectionTitle">
          <div>
            <h2>Conversación simulada</h2>
            <p className="opMuted">
              Prueba conversación natural, violencia,
              angustia y señales de autolesión.
            </p>
          </div>

          <button
            className="opBtn secondary"
            onClick={reset}
          >
            Nueva
          </button>
        </div>

        <div className="opChat">
          {chat.length === 0 && (
            <div className="opEmpty">
              Selecciona un escenario o escribe
              un mensaje para comenzar.
            </div>
          )}

          {chat.map((message, index) => (
            <div
              key={index}
              className={`opMessage ${message.direction}`}
              style={{
                marginBottom: 10,
              }}
            >
              <div>{message.text}</div>

              {message.risk && (
                <div className="opMeta">
                  Violencia: {message.risk} ·{' '}
                  {message.score}/100
                  {' · '}
                  Angustia: {message.distress}
                  {' · '}
                  Autolesión: {message.selfHarm}
                  {' · '}
                  Etapa: {message.stage}
                  {message.careOffer
                    ? ' · Ofrecer terapeuta'
                    : ''}
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 12,
          }}
        >
          <textarea
            className="opTextarea"
            style={{
              minHeight: 70,
            }}
            value={text}
            onChange={(event: { target: { value: string } }) =>
              setText(event.target.value)
            }
            placeholder="Escribe como si fueras la usuaria…"
          />

          <button
            className="opBtn"
            onClick={() => send()}
            disabled={busy}
          >
            {busy
              ? 'Analizando…'
              : 'Enviar'}
          </button>
        </div>

        {conversationId && (
          <p
            className="opMuted"
            style={{
              fontSize: 12,
            }}
          >
            Expediente TEST: {conversationId}
          </p>
        )}
      </section>

      <aside className="opPanel">
        <h3>Escenarios rápidos</h3>

        <div className="opScenarioGrid">
          {scenarios.map(
            ([name, message]) => (
              <button
                key={name}
                className="opScenario"
                onClick={() =>
                  send(message)
                }
                disabled={busy}
              >
                <strong>{name}</strong>

                <div
                  className="opMuted"
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                  }}
                >
                  {message}
                </div>
              </button>
            )
          )}
        </div>

        <div
          className="opWarning"
          style={{
            marginTop: 16,
          }}
        >
          El simulador escribe en las mismas
          tablas operativas, pero marca los
          expedientes y canalizaciones como{' '}
          <strong>TEST</strong>. Nunca contacta
          terapeutas ni autoridades.
        </div>
      </aside>
    </div>
  );
}
