import { MemberWindow, windowsBetween } from './time';

const MIN = 60_000;

export interface SlotSuggestion {
  start: number;
  end: number;
  fitPct: number;             // % of participants fully inside their working hours
  insideCount: number;
  outside: string[];          // userIds outside their window
  zeroOvertime: boolean;
}

/**
 * Deterministic meeting-slot finder: scores every 15-minute start over the next `days` days and
 * returns the best `limit` options (highest fit first, then earliest).
 */
export function suggestSlots(
  participants: MemberWindow[],
  durationMin: number,
  from: number,
  opts: { days?: number; stepMin?: number; limit?: number } = {},
): SlotSuggestion[] {
  const { days = 5, stepMin = 15, limit = 3 } = opts;
  if (participants.length === 0 || durationMin <= 0) return [];
  const step = stepMin * MIN;
  const firstStart = Math.ceil(from / step) * step;
  const horizon = from + days * 24 * 60 * MIN;
  // precompute each participant's working windows once for the whole horizon
  const wins = participants.map((p) => windowsBetween(p, from, horizon + durationMin * MIN, { skipWeekends: true }));
  const out: SlotSuggestion[] = [];
  for (let s = firstStart; s < horizon; s += step) {
    const e = s + durationMin * MIN;
    const outside: string[] = [];
    participants.forEach((p, i) => {
      if (!wins[i].some((w) => w.start <= s && w.end >= e)) outside.push(p.userId);
    });
    const insideCount = participants.length - outside.length;
    if (insideCount === 0) continue;
    out.push({
      start: s,
      end: e,
      insideCount,
      outside,
      fitPct: Math.round((insideCount / participants.length) * 100),
      zeroOvertime: outside.length === 0,
    });
  }
  out.sort((a, b) => b.insideCount - a.insideCount || a.start - b.start);
  // de-duplicate adjacent starts so suggestions are meaningfully different (>= 1h apart)
  const picked: SlotSuggestion[] = [];
  for (const s of out) {
    if (picked.every((p) => Math.abs(p.start - s.start) >= 60 * MIN)) picked.push(s);
    if (picked.length >= limit) break;
  }
  return picked;
}
