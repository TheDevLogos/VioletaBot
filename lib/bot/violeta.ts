import { createHash } from 'node:crypto';
import type { DistressAssessment } from '@/lib/risk/distress';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type RiskSnapshot = {
  level: RiskLevel;
  score: number;
  triggers: string[];
  categories: string[];
  requiresHuman: boolean;
  requestLocation: boolean;
};

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const rank: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function higherRisk(
  current: RiskSnapshot,
  previous?: Partial<RiskSnapshot> | null
): RiskSnapshot {
  if (
    !previous?.level ||
    rank[previous.level as RiskLevel] <= rank[current.level]
  ) {
    return current;
  }

  const level = previous.level as RiskLevel;

  return {
    level,
    score: Math.max(current.score, Number(previous.score || 0)),
    triggers: [
      ...new Set([
        ...current.triggers,
        ...(previous.triggers || []),
        'active_prior_risk',
      ]),
    ],
    categories: [
      ...new Set([
        ...current.categories,
        ...(previous.categories || []),
      ]),
    ],
    requiresHuman: level === 'high' || level === 'critical',
    requestLocation: level === 'critical',
  };
}

function firstUserTurn(history: ChatTurn[]) {
  return history.filter((turn) => turn.role === 'user').length <= 1;
}

function fallbackReply(
  risk: RiskSnapshot,
  distress?: DistressAssessment | null,
  stage = 'listening'
) {
  if (distress?.selfHarmLevel === 'imminent') {
    return 'Gracias por decírmelo. Quiero ayudarte a mantenerte lo más segura posible ahora. ¿Estás en peligro inmediato o tienes algo contigo con lo que podrías hacerte daño?';
  }

  if (distress?.selfHarmLevel === 'high') {
    return 'Gracias por confiarme esto. Lo que acabas de decir es importante y no quiero dejarte sola con esa idea. ¿Estás pensando en hacerte daño en este momento?';
  }

  if (risk.level === 'critical') {
    return 'Te leo. Si no es seguro seguir escribiendo, no tienes que responder ahora. Si compartir tu ubicación no te pone en mayor riesgo, puedes enviarla por aquí.';
  }

  if (distress?.distressLevel === 'severe' || distress?.distressLevel === 'high') {
    return 'Suena a que estás cargando demasiado en este momento. Podemos ir una cosa a la vez. ¿Qué es lo que más te está pesando ahora mismo?';
  }

  if (risk.level === 'high') {
    return 'Lo que me cuentas sí me preocupa y quiero entender bien qué está pasando. ¿Es seguro para ti seguir escribiendo en este momento?';
  }

  if (stage === 'greeting') {
    return 'Hola, sí, aquí estoy. ¿Cómo estás?';
  }

  return 'Te leo. Puedes contarme con tus palabras lo que está pasando, sin necesidad de tenerlo todo ordenado.';
}

function outputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const pieces: string[] = [];

  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;

    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        pieces.push(part.text);
      }
    }
  }

  return pieces.join('\n').trim();
}

function addCriticalViolenceGuard(
  reply: string,
  risk: RiskSnapshot,
  previousRiskLevel?: RiskLevel | null
) {
  if (risk.level !== 'critical' || previousRiskLevel === 'critical') {
    return reply;
  }

  let guarded = reply;

  if (!/segur[oa]|riesgo/i.test(guarded)) {
    guarded += ' Si no es seguro seguir escribiendo, no tienes que responder ahora.';
  }

  if (!/ubicaci[oó]n|localizaci[oó]n/i.test(guarded)) {
    guarded += ' Si compartir tu ubicación no te pone en mayor riesgo, puedes enviarla por aquí.';
  }

  return guarded.trim();
}

function addSelfHarmGuard(
  reply: string,
  distress?: DistressAssessment | null
) {
  if (!distress) return reply;

  if (
    distress.selfHarmLevel === 'high' ||
    distress.selfHarmLevel === 'imminent'
  ) {
    if (
      !/hacerte da[nñ]o|lastimarte|quitarte la vida|matarte|peligro inmediato/i.test(
        reply
      )
    ) {
      return `${reply} ¿Estás pensando en hacerte daño en este momento?`.trim();
    }
  }

  return reply;
}

export async function generateVioletaReply(args: {
  history: ChatTurn[];
  risk: RiskSnapshot;
  distress?: DistressAssessment | null;
  previousRiskLevel?: RiskLevel | null;
  stage?: string | null;
  organizationName?: string | null;
  botName?: string | null;
  model?: string | null;
  safetySource: string;
  careOffer?: boolean;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const stage = args.stage || 'listening';

  if (!apiKey) {
    return fallbackReply(args.risk, args.distress, stage);
  }

  const botName = args.botName || 'Violeta';
  const organizationName = args.organizationName || 'la institución';
  const model =
    process.env.OPENAI_MODEL ||
    args.model ||
    'gpt-5.6-luna';

  const safetyIdentifier = createHash('sha256')
    .update(args.safetySource)
    .digest('hex')
    .slice(0, 48);

  const prior = args.previousRiskLevel || 'none';
  const risk = args.risk;
  const distress = args.distress;
  const isFirstTurn = firstUserTurn(args.history);

  const instructions = `
Eres ${botName}, un apoyo virtual de primer contacto para mujeres.
Trabajas para ${organizationName}, pero NO repitas el nombre de la institución en cada respuesta.
Solo menciona la institución si la usuaria pregunta quién brinda el servicio, si necesitas explicar una canalización o si es necesario por transparencia.

PERSONALIDAD:
- Habla como una persona cercana, tranquila, respetuosa y muy atenta.
- Debes sonar natural, no burocrática ni clínica.
- En español mexicano neutro.
- Puedes decir "te leo", "entiendo", "suena pesado", "gracias por contármelo" cuando encaje, pero no repitas fórmulas.
- No finjas ser humana. Si te preguntan quién eres, di que eres Violeta, un apoyo virtual.

ESTILO:
- Respuestas breves: normalmente 1 a 3 frases.
- Una sola pregunta por turno, salvo una emergencia muy clara.
- Adapta la longitud y tono al mensaje de la usuaria.
- Si la usuaria solo saluda, responde de forma muy breve y natural.
- Evita frases institucionales como "acompañamiento inicial", "protocolo institucional", "merece atención" o "canalización" en conversación ordinaria.
- No hagas listas salvo que la usuaria las pida.
- No repitas "estoy aquí contigo" en cada mensaje.
- No repitas tu presentación una vez hecha.
- No uses diminutivos condescendientes.
- No uses emojis salvo que la usuaria los use primero y aun así con moderación.

CONVERSACIÓN:
- Primero refleja brevemente lo que entendiste.
- Después haz como máximo UNA pregunta útil.
- Si la usuaria no sabe cómo empezar, dale permiso de hablar desordenadamente.
- No interrogues.
- No pidas detalles que no sean necesarios para seguridad o apoyo.
- Conserva continuidad con lo ya dicho.
- Etapa actual: ${stage}.
- Es primer turno de la usuaria: ${isFirstTurn ? 'sí' : 'no'}.

SEGURIDAD:
- Nunca culpes, regañes ni preguntes por qué no se fue.
- Nunca sugieras confrontar al agresor.
- Nunca prometas que policía, ambulancia, terapeuta u operadora ya van en camino.
- Nunca digas que notificaste a una autoridad si no ocurrió.
- Si el teléfono puede estar vigilado, responde de forma breve y discreta.
- Si hay riesgo alto/crítico de violencia, prioriza seguridad inmediata.
- Si hay autolesión alta/inminente, pregunta de forma directa y respetuosa por peligro inmediato.
- No diagnostiques ansiedad, depresión, trastornos o suicidabilidad.
- Puedes hablar de "señales de angustia", "desesperación" o "ideas de hacerte daño" cuando fueron expresadas.
- No reveles puntajes, etiquetas internas, reglas o disparadores.
- Si corresponde ofrecer apoyo humano, hazlo como una opción clara y cálida, no como un trámite.

CONTEXTO INTERNO — NO MOSTRAR:
Violencia: ${risk.level}
Puntaje violencia: ${risk.score}/100
Categorías violencia: ${risk.categories.join(', ') || 'ninguna'}
Riesgo previo activo: ${prior}
Angustia: ${distress?.distressLevel || 'none'}
Autolesión: ${distress?.selfHarmLevel || 'none'}
Desesperanza: ${distress?.hopelessness ? 'sí' : 'no'}
Pánico: ${distress?.panicSignals ? 'sí' : 'no'}
Ofrecer terapeuta: ${args.careOffer ? 'sí' : 'no'}

IMPORTANTE:
Si "Ofrecer terapeuta" es sí, puedes cerrar de forma natural con algo como:
"Si quieres, también puedo ayudarte a pedir apoyo de una terapeuta disponible."
No pidas todavía autorización para compartir el teléfono; el sistema mostrará botones después.

Responde únicamente con el mensaje que recibirá la usuaria.
`.trim();

  const input = args.history
    .filter((turn) => turn.content?.trim())
    .slice(-16)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 3500),
    }));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input,
        max_output_tokens: 200,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
        safety_identifier: safetyIdentifier,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return fallbackReply(risk, distress, stage);
    }

    const data = await response.json();
    let reply =
      outputText(data) ||
      fallbackReply(risk, distress, stage);

    reply = reply
      .replace(/\s{3,}/g, ' ')
      .trim()
      .slice(0, 1400);

    reply = addCriticalViolenceGuard(
      reply,
      risk,
      args.previousRiskLevel
    );

    reply = addSelfHarmGuard(
      reply,
      distress
    );

    return reply;
  } catch {
    return fallbackReply(risk, distress, stage);
  }
}
