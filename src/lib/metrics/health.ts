/**
 * Company Health Index — a documented, deterministic 0–100 score (four equally weighted pillars).
 * Shown to users in an info popover, so keep HEALTH_FORMULA in sync with computeHealth().
 */
export const HEALTH_FORMULA = [
  { key: 'velocity', label: 'Velocity', weight: 25, detail: 'Points completed vs. points expected by today in the active sprint (capped at 100%).' },
  { key: 'runway', label: 'Runway', weight: 25, detail: 'Months of runway, capped at 24 months = 100.' },
  { key: 'culture', label: 'Culture', weight: 25, detail: '60% average check-in mood (14 days) + 40% check-in completion rate.' },
  { key: 'compliance', label: 'Compliance', weight: 25, detail: 'Share of applicable compliance controls that are passing.' },
] as const;

export interface HealthInput {
  sprint: { donePoints: number; committedPoints: number; elapsedFraction: number } | null;
  runwayMonths: number | null;     // Infinity when cash-flow positive; null when no finance data
  moodAvg: number | null;          // 1..5
  checkinRate: number | null;      // 0..1
  controls: { passing: number; applicable: number } | null;
}

export interface HealthResult {
  score: number;
  status: 'optimal' | 'watch' | 'at_risk';
  components: { velocity: number | null; runway: number | null; culture: number | null; compliance: number | null };
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function velocityScore(s: HealthInput['sprint']): number | null {
  if (!s || s.committedPoints <= 0) return null;
  const expected = s.committedPoints * clamp(s.elapsedFraction, 0.05, 1);
  return clamp(Math.round((s.donePoints / expected) * 100));
}

export function runwayScore(months: number | null): number | null {
  if (months === null || Number.isNaN(months)) return null;
  return clamp(Math.round((Math.min(months, 24) / 24) * 100));
}

export function cultureScore(mood: number | null, rate: number | null): number | null {
  if (mood === null && rate === null) return null;
  const moodPart = mood === null ? null : ((clamp(mood, 1, 5) - 1) / 4) * 100;
  const ratePart = rate === null ? null : clamp(rate, 0, 1) * 100;
  if (moodPart === null) return Math.round(ratePart!);
  if (ratePart === null) return Math.round(moodPart);
  return Math.round(moodPart * 0.6 + ratePart * 0.4);
}

export function complianceScore(c: HealthInput['controls']): number | null {
  if (!c || c.applicable <= 0) return null;
  return clamp(Math.round((c.passing / c.applicable) * 100));
}

export function computeHealth(input: HealthInput): HealthResult {
  const components = {
    velocity: velocityScore(input.sprint),
    runway: runwayScore(input.runwayMonths),
    culture: cultureScore(input.moodAvg, input.checkinRate),
    compliance: complianceScore(input.controls),
  };
  // pillars with no data yet are excluded rather than counted as zero
  const present = Object.values(components).filter((v): v is number => v !== null);
  const score = present.length ? Math.round(present.reduce((a, b) => a + b, 0) / present.length) : 0;
  const status = score >= 80 ? 'optimal' : score >= 60 ? 'watch' : 'at_risk';
  return { score, status, components };
}
