import { goldenOverlap, utcMidnight } from '@/lib/scheduling/overlap';
import { suggestSlots } from '@/lib/scheduling/slots';
import { workWindowUtc, dayPhase, regionOf, isWithinWorkingHours, MemberWindow } from '@/lib/scheduling/time';

const m = (userId: string, timezone: string, workStart = '09:00', workEnd = '17:00'): MemberWindow => ({ userId, timezone, workStart, workEnd });
const H = 3_600_000;
const MON = Date.UTC(2026, 9, 12); // Mon 12 Oct 2026 00:00 UTC

describe('workWindowUtc', () => {
  it('handles DST: London 09:00 is 09:00 UTC before the switch and 08:00 UTC after', () => {
    const london = m('a', 'Europe/London');
    expect(new Date(workWindowUtc(london, '2026-03-27').start).toISOString()).toBe('2026-03-27T09:00:00.000Z');
    expect(new Date(workWindowUtc(london, '2026-03-30').start).toISOString()).toBe('2026-03-30T08:00:00.000Z');
  });
  it('handles overnight shifts by rolling the end into the next day', () => {
    const w = workWindowUtc(m('a', 'UTC', '22:00', '06:00'), '2026-10-12');
    expect((w.end - w.start) / H).toBe(8);
  });
});

describe('goldenOverlap', () => {
  it('finds the London + Nairobi overlap (08:00–14:00 UTC while BST is in force)', () => {
    const r = goldenOverlap([m('lon', 'Europe/London'), m('nbo', 'Africa/Nairobi', '08:00', '17:00')], MON, 2);
    expect(r.best && new Date(r.best.start).toISOString()).toBe('2026-10-12T08:00:00.000Z');
    expect(r.best && new Date(r.best.end).toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(r.coveragePct).toBe(100);
    expect(r.hours).toBe(6);
    expect(r.meetsTarget).toBe(true);
  });
  it('date line: Tokyo Monday maps to 00:00–08:00 UTC Monday', () => {
    const r = goldenOverlap([m('tyo', 'Asia/Tokyo')], MON);
    expect(new Date(r.best!.start).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(new Date(r.best!.end).toISOString()).toBe('2026-10-12T08:00:00.000Z');
  });
  it('Tokyo + San Francisco never overlap in standard 9–5 hours; best is a single member', () => {
    const r = goldenOverlap([m('tyo', 'Asia/Tokyo'), m('sfo', 'America/Los_Angeles')], MON, 2);
    expect(r.best!.count).toBe(1);
    expect(r.coveragePct).toBe(50);
  });
  it("skips weekends in each member's own zone (Sunday UTC = Sunday in Tokyo)", () => {
    const sunday = Date.UTC(2026, 9, 11);
    const r = goldenOverlap([m('tyo', 'Asia/Tokyo')], sunday);
    // Monday 09:00 JST is Sunday 24:00 UTC, so nothing on the Sunday UTC day
    expect(r.best).toBeNull();
    expect(r.coveragePct).toBe(0);
  });
  it('flags a window shorter than the target', () => {
    const r = goldenOverlap([m('lon', 'Europe/London'), m('nyc', 'America/New_York')], MON, 2);
    // NYC 09:00 EDT = 13:00 UTC; London ends 16:00 UTC → 3h
    expect(r.hours).toBe(3);
    expect(goldenOverlap([m('lon', 'Europe/London'), m('nyc', 'America/New_York')], MON, 4).meetsTarget).toBe(false);
  });
  it('utcMidnight truncates to the UTC day', () => {
    expect(utcMidnight(MON + 13.5 * H)).toBe(MON);
  });
});

describe('suggestSlots', () => {
  const team = [m('lon', 'Europe/London'), m('ber', 'Europe/Berlin'), m('nbo', 'Africa/Nairobi', '08:00', '17:00')];
  it('returns a zero-overtime slot when one exists, with 100% fit', () => {
    const s = suggestSlots(team, 60, MON + 6 * H);
    expect(s[0].zeroOvertime).toBe(true);
    expect(s[0].fitPct).toBe(100);
    for (const p of team) expect(isWithinWorkingHours(p, s[0].start, s[0].end)).toBe(true);
  });
  it('suggestions are at least an hour apart and ordered by fit', () => {
    const s = suggestSlots(team, 30, MON, { limit: 3 });
    expect(s).toHaveLength(3);
    expect(Math.abs(s[1].start - s[0].start)).toBeGreaterThanOrEqual(H);
    expect(s[0].insideCount).toBeGreaterThanOrEqual(s[2].insideCount);
  });
  it('reports who is outside when no perfect slot exists', () => {
    const s = suggestSlots([m('tyo', 'Asia/Tokyo'), m('sfo', 'America/Los_Angeles')], 30, MON, { days: 2 });
    expect(s[0].zeroOvertime).toBe(false);
    expect(s[0].outside).toHaveLength(1);
  });
  it('returns nothing for no participants', () => {
    expect(suggestSlots([], 30, MON)).toEqual([]);
  });
});

describe('dayPhase / regionOf', () => {
  it('classifies phases around the working window', () => {
    const lon = m('lon', 'Europe/London');
    expect(dayPhase(lon, Date.UTC(2026, 9, 12, 8, 20))).toBe('starting');
    expect(dayPhase(lon, Date.UTC(2026, 9, 12, 12, 0))).toBe('working');
    expect(dayPhase(lon, Date.UTC(2026, 9, 12, 15, 30))).toBe('wrapping');
    expect(dayPhase(lon, Date.UTC(2026, 9, 12, 22, 0))).toBe('off');
  });
  it('maps zones to regions', () => {
    expect(regionOf('America/New_York')).toBe('Americas');
    expect(regionOf('Africa/Nairobi')).toBe('EMEA');
    expect(regionOf('Asia/Singapore')).toBe('APAC');
  });
});

describe('suggestSlots with calendar busy times', () => {
  const H = 3_600_000;
  const MON = Date.UTC(2026, 9, 12, 0, 0);   // Monday 12 Oct 2026
  const nbo = { userId: 'nbo', name: 'Amina', timezone: 'Africa/Nairobi', workStart: '09:00', workEnd: '17:00', city: 'Nairobi' };
  const lag = { userId: 'lag', name: 'Tunde', timezone: 'Africa/Lagos', workStart: '09:00', workEnd: '17:00', city: 'Lagos' };
  it('avoids times someone is busy in their own calendar', () => {
    const free = suggestSlots([nbo, lag], 60, MON + 6 * H, { days: 1, limit: 1 })[0];
    const busy = { lag: [{ start: free.start, end: free.end }] };
    const next = suggestSlots([nbo, lag], 60, MON + 6 * H, { days: 1, limit: 1, busy })[0];
    expect(free.allFree).toBe(true);
    expect(next.start).not.toBe(free.start);
    expect(next.allFree).toBe(true);
  });
  it('reports who is busy when nobody can avoid a clash', () => {
    const allDay = { nbo: [{ start: MON, end: MON + 48 * H }] };
    const s = suggestSlots([nbo, lag], 30, MON + 6 * H, { days: 1, limit: 1, busy: allDay })[0];
    expect(s.busy).toEqual(['nbo']);
    expect(s.fitPct).toBe(50);
    expect(s.zeroOvertime).toBe(true);
    expect(s.allFree).toBe(false);
  });
});
