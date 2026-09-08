import type { RiskSnapshot } from '@/lib/bot/violeta';
import type { DistressAssessment } from '@/lib/risk/distress';

export type ReferralType =
  | 'emotional_support'
  | 'suicide_prevention'
  | 'violence_support'
  | 'combined';

export type ReferralPriority =
  | 'normal'
  | 'priority'
  | 'urgent'
  | 'immediate';

export function referralTypeFor(
  risk: RiskSnapshot,
  distress: DistressAssessment
): ReferralType {
  const violenceHigh = risk.level === 'high' || risk.level === 'critical';
  const selfHarm = distress.selfHarmLevel !== 'none';

  if (violenceHigh && selfHarm) return 'combined';
  if (distress.selfHarmLevel === 'high' || distress.selfHarmLevel === 'imminent') {
    return 'suicide_prevention';
  }
  if (violenceHigh) return 'violence_support';
  return 'emotional_support';
}

export function referralPriorityFor(
  risk: RiskSnapshot,
  distress: DistressAssessment
): ReferralPriority {
  if (risk.level === 'critical' || distress.selfHarmLevel === 'imminent') {
    return 'immediate';
  }

  if (
    risk.level === 'high' ||
    distress.selfHarmLevel === 'high' ||
    distress.distressLevel === 'severe'
  ) {
    return 'urgent';
  }

  if (
    distress.selfHarmLevel === 'concern' ||
    distress.distressLevel === 'high' ||
    risk.level === 'medium'
  ) {
    return 'priority';
  }

  return 'normal';
}

export function alertRiskLevelForCare(
  risk: RiskSnapshot,
  distress: DistressAssessment
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (risk.level === 'critical' || distress.selfHarmLevel === 'imminent') {
    return 'critical';
  }

  if (
    risk.level === 'high' ||
    distress.selfHarmLevel === 'high' ||
    distress.distressLevel === 'severe'
  ) {
    return 'high';
  }

  if (
    risk.level === 'medium' ||
    distress.selfHarmLevel === 'concern' ||
    distress.distressLevel === 'high'
  ) {
    return 'medium';
  }

  return risk.level;
}
