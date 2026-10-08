import { isWithinWorkingHours, type MemberWindow } from './time';

export interface ShiftInsight { meetingId: string; title: string; startsAt: number; shiftMin: number; newStart: number; insideBefore: number; insideAfter: number; total: number }

/**
 * Rule-based "chrono-optimizer": for each meeting, find the smallest shift (±15…±120 min) that puts the
 * most participants inside their working hours. Only returns meetings that would actually improve.
 */
export function shiftInsights(
  meetings: { id: string; title: string; starts_at: string; duration_min: number; participantIds: string[] }[],
  windows: Map<string, MemberWindow>, maxShiftMin = 120,
): ShiftInsight[] {
  const out: ShiftInsight[] = [];
  for (const m of meetings) {
    const people = m.participantIds.map((id) => windows.get(id)).filter(Boolean) as MemberWindow[];
    if (people.length < 2) continue;
    const start = new Date(m.starts_at).getTime();
    const dur = m.duration_min * 60_000;
    const inside = (s: number) => people.filter((p) => isWithinWorkingHours(p, s, s + dur)).length;
    const before = inside(start);
    if (before === people.length) continue;
    let best = { shift: 0, count: before };
    for (let d = 15; d <= maxShiftMin; d += 15) {
      for (const shift of [-d, d]) {
        const c = inside(start + shift * 60_000);
        if (c > best.count) best = { shift, count: c };
      }
    }
    if (best.count > before) {
      out.push({ meetingId: m.id, title: m.title, startsAt: start, shiftMin: best.shift, newStart: start + best.shift * 60_000, insideBefore: before, insideAfter: best.count, total: people.length });
    }
  }
  return out.sort((a, b) => (b.insideAfter - b.insideBefore) - (a.insideAfter - a.insideBefore));
}
