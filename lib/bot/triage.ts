import { createHash } from 'node:crypto';
import type { ChatTurn } from '@/lib/bot/violeta';
import type {
  SemanticDistressAssessment,
  DistressLevel,
  SelfHarmLevel,
} from '@/lib/risk/distress';

function extractOutputText(data: any): string {
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

export async function assessSemanticTriage(args: {
  history: ChatTurn[];
  currentText: string;
  model?: string | null;
  safetySource: string;
}): Promise<SemanticDistressAssessment | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_TRIAGE_MODEL || args.model || process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const safetyIdentifier = createHash('sha256')
    .update(`triage:${args.safetySource}`)
    .digest('hex')
    .slice(0, 48);

  const conversation = args.history
    .filter((turn) => turn.content?.trim())
    .slice(-10)
    .map((turn) => `${turn.role === 'user' ? 'USUARIA' : 'VIOLETA'}: ${turn.content.slice(0, 1800)}`)
    .join('\n');

  const instructions = `
Analiza señales EXPRESADAS de malestar emocional en una conversación de apoyo a mujeres.
No diagnostiques trastornos. No inventes intención suicida. No infieras un plan si no fue expresado.
Tu tarea es ayudar a priorizar revisión humana.

DISTRESS:
- none: sin señal relevante.
- mild: tristeza, preocupación o nerviosismo leve.
- moderate: llanto persistente, ansiedad intensa, pánico, desbordamiento.
- high: desesperación, sensación de no poder más, desesperanza significativa.
- severe: desregulación extrema o lenguaje asociado a peligro inmediato.

SELF_HARM:
- none: sin señal.
- concern: lenguaje ambiguo de desaparición, desesperanza o falta de sentido.
- high: expresa querer morir, suicidarse o hacerse daño.
- imminent: expresa plan, medios, intento en curso o intención de actuar ahora.

Sé conservador con high/imminent. Si existe ambigüedad, usa concern y marca el resumen para revisión humana.
El resumen debe ser clínicamente neutral, breve y no incluir diagnósticos.
`.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

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
        reasoning: { effort: 'low' },
        max_output_tokens: 180,
        safety_identifier: safetyIdentifier,
        instructions,
        input: `CONVERSACIÓN RECIENTE:\n${conversation}\n\nMENSAJE ACTUAL:\n${args.currentText.slice(0, 3000)}`,
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'violeta_emotional_triage',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                distress_level: {
                  type: 'string',
                  enum: ['none', 'mild', 'moderate', 'high', 'severe'],
                },
                self_harm_level: {
                  type: 'string',
                  enum: ['none', 'concern', 'high', 'imminent'],
                },
                hopelessness: { type: 'boolean' },
                panic_signals: { type: 'boolean' },
                summary: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: [
                'distress_level',
                'self_harm_level',
                'hopelessness',
                'panic_signals',
                'summary',
                'confidence',
              ],
            },
          },
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const raw = extractOutputText(data);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return {
      distressLevel: parsed.distress_level as DistressLevel,
      selfHarmLevel: parsed.self_harm_level as SelfHarmLevel,
      hopelessness: Boolean(parsed.hopelessness),
      panicSignals: Boolean(parsed.panic_signals),
      summary: String(parsed.summary || '').slice(0, 500),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
    };
  } catch {
    return null;
  }
}
