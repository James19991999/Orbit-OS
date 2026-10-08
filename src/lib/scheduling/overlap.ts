import { MemberWindow, windowsBetween } from './time';

const MIN = 60_000;
export const SLOT_MIN = 15;

export interface OverlapResult {
  dayStart: number;          // UTC midnight of the analysed day
  slots: number[];           // available-member count per 15-min slot (96 slots)
  total: number;             // members considered
  best: { start: number; end: number; count: number } | null;
  coveragePct: number;       // best.count / total * 100
  hours: number;             // length of best window in hours
  meetsTarget: boolean;      // hours >= target
}

/**
 * Golden overlap for a UTC day: the longest contiguous window where the largest number of
 * members are simultaneously inside their working hours (weekends in each member's zone excluded).
 */
export function goldenOverlap(members: MemberWindow[], dayStartUtc: number, targetHours = 2): OverlapResult {
  const nSlots = (24 * 60) / SLOT_MIN;
  const slots = new Array<number>(nSlots).fill(0);
  const dayEnd = dayStartUtc + 24 * 60 * MIN;
  for (const m of members) {
    const wins = windowsBetween(m, dayStartUtc, dayEnd, { skipWeekends: true });
    for (let i = 0; i < nSlots; i++) {
      const s = dayStartUtc + i * SLOT_MIN * MIN;
      const e = s + SLOT_MIN * MIN;
      if (wins.some((w) => w.start <= s && w.end >= e)) slots[i]++;
    }
  }
  const max = Math.max(0, ...slots);
  let best: OverlapResult['best'] = null;
  if (max > 0) {
    let runStart = -1;
    for (let i = 0; i <= nSlots; i++) {
      const at = i < nSlots && slots[i] === max;
      if (at && runStart < 0) runStart = i;
      if (!at && runStart >= 0) {
        const len = i - runStart;
        if (!best || len * SLOT_MIN * MIN > best.end - best.start) {
          best = { start: dayStartUtc + runStart * SLOT_MIN * MIN, end: dayStartUtc + i * SLOT_MIN * MIN, count: max };
        }
        runStart = -1;
      }
    }
  }
  const hours = best ? (best.end - best.start) / (60 * MIN) : 0;
  const total = members.length;
  return {
    dayStart: dayStartUtc,
    slots,
    total,
    best,
    coveragePct: total && best ? Math.round((best.count / total) * 100) : 0,
    hours,
    meetsTarget: hours >= targetHours,
  };
}

export function utcMidnight(instant: number): number {
  const d = new Date(instant);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
