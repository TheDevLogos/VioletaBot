export type DistressLevel = 'none' | 'mild' | 'moderate' | 'high' | 'severe';
export type SelfHarmLevel = 'none' | 'concern' | 'high' | 'imminent';

export type DistressAssessment = {
  distressLevel: DistressLevel;
  selfHarmLevel: SelfHarmLevel;
  hopelessness: boolean;
  panicSignals: boolean;
  triggers: string[];
  needsHuman: boolean;
  offerTherapist: boolean;
  urgent: boolean;
};

export type SemanticDistressAssessment = {
  distressLevel: DistressLevel;
  selfHarmLevel: SelfHarmLevel;
  hopelessness: boolean;
  panicSignals: boolean;
  summary: string;
  confidence: number;
};

const distressRank: Record<DistressLevel, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  high: 3,
  severe: 4,
};

const selfHarmRank: Record<SelfHarmLevel, number> = {
  none: 0,
  concern: 1,
  high: 2,
  imminent: 3,
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const mildDistress = [
  /\bme siento mal\b/,
  /\bestoy triste\b/,
  /\bme siento triste\b/,
  /\bestoy nerviosa\b/,
  /\bestoy ansiosa\b/,
  /\bmucha ansiedad\b/,
  /\bestoy preocupada\b/,
  /\bno puedo dormir\b/,
  /\bno he podido dormir\b/,
];

const moderateDistress = [
  /\bno puedo dejar de llorar\b/,
  /\bno paro de llorar\b/,
  /\bme falta el aire\b/,
  /\bme cuesta respirar\b/,
  /\bataque de panico\b/,
  /\bpanico\b/,
  /\bno puedo calmarme\b/,
  /\bme estoy desesperando\b/,
  /\bme siento rebasada\b/,
  /\bme siento sobrepasada\b/,
];

const highDistress = [
  /\bestoy desesperada\b/,
  /\bya no puedo mas\b/,
  /\bno aguanto mas\b/,
  /\bno veo salida\b/,
  /\bno encuentro salida\b/,
  /\btodo me supera\b/,
  /\btodo me rebasa\b/,
  /\bquisiera desaparecer\b/,
  /\bquiero desaparecer\b/,
];

const selfHarmConcern = [
  /\bquisiera desaparecer\b/,
  /\bquiero desaparecer\b/,
  /\btodos estarian mejor sin mi\b/,
  /\bseria mejor sin mi\b/,
  /\bmi vida no tiene sentido\b/,
  /\bno tiene sentido seguir\b/,
  /\bya no encuentro sentido\b/,
  /\bno veo salida\b/,
  /\bno encuentro salida\b/,
];

const selfHarmHigh = [
  /\bno quiero vivir\b/,
  /\bya no quiero vivir\b/,
  /\bquiero morir\b/,
  /\bme quiero morir\b/,
  /\bme quiero matar\b/,
  /\bquiero matarme\b/,
  /\bvoy a matarme\b/,
  /\bquiero quitarme la vida\b/,
  /\bvoy a quitarme la vida\b/,
  /\bquiero hacerme dano\b/,
  /\bvoy a hacerme dano\b/,
];

const selfHarmImminent = [
  /\blo voy a hacer ahora\b/,
  /\bme voy a matar ahora\b/,
  /\bme voy a quitar la vida ahora\b/,
  /\btengo un plan para matarme\b/,
  /\bya tengo un plan\b/,
  /\btengo pastillas para\b/,
  /\bya tome pastillas\b/,
  /\bme estoy cortando\b/,
  /\bya me corte\b/,
  /\btengo un arma y\b/,
];

const hopelessnessPatterns = [
  /\bno hay salida\b/,
  /\bno veo salida\b/,
  /\bno encuentro salida\b/,
  /\bnada va a cambiar\b/,
  /\bnada tiene sentido\b/,
  /\bno tiene sentido seguir\b/,
  /\btodos estarian mejor sin mi\b/,
];

const panicPatterns = [
  /\bataque de panico\b/,
  /\bpanico\b/,
  /\bme falta el aire\b/,
  /\bme cuesta respirar\b/,
  /\bno puedo respirar\b/,
  /\bno puedo calmarme\b/,
  /\bestoy temblando\b/,
];

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function maxDistress(a: DistressLevel, b: DistressLevel): DistressLevel {
  return distressRank[a] >= distressRank[b] ? a : b;
}

export function evaluateDistress(text: string): DistressAssessment {
  const normalized = normalize(text);
  const triggers: string[] = [];

  let distressLevel: DistressLevel = 'none';
  let selfHarmLevel: SelfHarmLevel = 'none';

  if (hasAny(normalized, mildDistress)) {
    distressLevel = maxDistress(distressLevel, 'mild');
    triggers.push('mild_distress_language');
  }

  if (hasAny(normalized, moderateDistress)) {
    distressLevel = maxDistress(distressLevel, 'moderate');
    triggers.push('moderate_distress_language');
  }

  if (hasAny(normalized, highDistress)) {
    distressLevel = maxDistress(distressLevel, 'high');
    triggers.push('high_distress_language');
  }

  if (hasAny(normalized, selfHarmConcern)) {
    selfHarmLevel = 'concern';
    distressLevel = maxDistress(distressLevel, 'high');
    triggers.push('self_harm_concern_language');
  }

  if (hasAny(normalized, selfHarmHigh)) {
    selfHarmLevel = 'high';
    distressLevel = maxDistress(distressLevel, 'severe');
    triggers.push('self_harm_explicit_language');
  }

  if (hasAny(normalized, selfHarmImminent)) {
    selfHarmLevel = 'imminent';
    distressLevel = 'severe';
    triggers.push('self_harm_imminent_language');
  }

  const hopelessness = hasAny(normalized, hopelessnessPatterns);
  const panicSignals = hasAny(normalized, panicPatterns);

  if (hopelessness) triggers.push('hopelessness_signal');
  if (panicSignals) {
    triggers.push('panic_signal');
    distressLevel = maxDistress(distressLevel, 'moderate');
  }

  return {
    distressLevel,
    selfHarmLevel,
    hopelessness,
    panicSignals,
    triggers: [...new Set(triggers)],
    needsHuman:
      distressRank[distressLevel] >= distressRank.high ||
      selfHarmRank[selfHarmLevel] >= selfHarmRank.concern,
    offerTherapist:
      distressRank[distressLevel] >= distressRank.high ||
      selfHarmRank[selfHarmLevel] >= selfHarmRank.concern,
    urgent:
      distressLevel === 'severe' ||
      selfHarmLevel === 'high' ||
      selfHarmLevel === 'imminent',
  };
}

export function combineDistress(
  rules: DistressAssessment,
  semantic?: SemanticDistressAssessment | null
): DistressAssessment & { semanticSummary?: string; confidence?: number } {
  if (!semantic) return rules;

  const distressLevel = maxDistress(rules.distressLevel, semantic.distressLevel);

  // La IA semántica puede elevar una señal ambigua a "concern",
  // pero no puede por sí sola declarar riesgo alto/inminente de autolesión.
  let selfHarmLevel = rules.selfHarmLevel;
  if (
    selfHarmLevel === 'none' &&
    semantic.selfHarmLevel !== 'none'
  ) {
    selfHarmLevel = 'concern';
  }

  const hopelessness = rules.hopelessness || semantic.hopelessness;
  const panicSignals = rules.panicSignals || semantic.panicSignals;
  const triggers = [...rules.triggers];

  if (
    distressRank[semantic.distressLevel] >
    distressRank[rules.distressLevel]
  ) {
    triggers.push('semantic_distress_raise');
  }

  if (
    rules.selfHarmLevel === 'none' &&
    semantic.selfHarmLevel !== 'none'
  ) {
    triggers.push('semantic_self_harm_review');
  }

  return {
    distressLevel,
    selfHarmLevel,
    hopelessness,
    panicSignals,
    triggers: [...new Set(triggers)],
    needsHuman:
      distressRank[distressLevel] >= distressRank.high ||
      selfHarmRank[selfHarmLevel] >= selfHarmRank.concern,
    offerTherapist:
      distressRank[distressLevel] >= distressRank.high ||
      selfHarmRank[selfHarmLevel] >= selfHarmRank.concern,
    urgent:
      distressLevel === 'severe' ||
      selfHarmLevel === 'high' ||
      selfHarmLevel === 'imminent',
    semanticSummary: semantic.summary,
    confidence: semantic.confidence,
  };
}
