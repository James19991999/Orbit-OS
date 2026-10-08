import { computeHealth, velocityScore, cultureScore } from '@/lib/metrics/health';
import { summarizeFinance, costVariances, formatRunway } from '@/lib/metrics/finance';
import { sprintProgress } from '@/lib/metrics/sprint';
import { invoiceDisplayStatus, unpaidSummary, nextInvoiceNumber } from '@/lib/metrics/invoices';
import { readiness, daysUntil } from '@/lib/compliance/readiness';
import { checkinRate, moodAverage, cognitiveLoad, burnoutRisk, meetingHoursByUser } from '@/lib/metrics/people';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';

const NOW = new Date('2026-10-08T09:00:00Z');

describe('health index', () => {
  it('averages the four pillars and classifies status', () => {
    const r = computeHealth({
      sprint: { donePoints: 25, committedPoints: 50, elapsedFraction: 0.5 },
      runwayMonths: 24, moodAvg: 5, checkinRate: 1, controls: { passing: 9, applicable: 10 },
    });
    expect(r.components).toEqual({ velocity: 100, runway: 100, culture: 100, compliance: 90 });
    expect(r.score).toBe(98);
    expect(r.status).toBe('optimal');
  });
  it('excludes pillars with no data instead of scoring them zero', () => {
    const r = computeHealth({ sprint: null, runwayMonths: null, moodAvg: null, checkinRate: null, controls: { passing: 1, applicable: 2 } });
    expect(r.score).toBe(50);
    expect(r.status).toBe('at_risk');
  });
  it('velocity compares against points expected by today, capped at 100', () => {
    expect(velocityScore({ donePoints: 10, committedPoints: 50, elapsedFraction: 0.5 })).toBe(40);
    expect(velocityScore({ donePoints: 50, committedPoints: 50, elapsedFraction: 0.1 })).toBe(100);
  });
  it('culture blends mood (60%) and check-in rate (40%)', () => {
    expect(cultureScore(3, 0.5)).toBe(Math.round(50 * 0.6 + 50 * 0.4));
  });
  it('treats infinite runway as full marks', () => {
    expect(computeHealth({ sprint: null, runwayMonths: Infinity, moodAvg: null, checkinRate: null, controls: null }).score).toBe(100);
  });
});

describe('finance summary', () => {
  const rows = [
    { month: '2026-07-01', kind: 'expense' as const, total_minor: 100 },
    { month: '2026-07-01', kind: 'payroll' as const, total_minor: 900 },
    { month: '2026-07-01', kind: 'revenue' as const, total_minor: 500 },
    { month: '2026-08-01', kind: 'expense' as const, total_minor: 200 },
    { month: '2026-08-01', kind: 'payroll' as const, total_minor: 900 },
    { month: '2026-08-01', kind: 'revenue' as const, total_minor: 600 },
    { month: '2026-09-01', kind: 'expense' as const, total_minor: 300 },
    { month: '2026-09-01', kind: 'payroll' as const, total_minor: 900 },
    { month: '2026-09-01', kind: 'revenue' as const, total_minor: 700 },
    { month: '2026-10-01', kind: 'expense' as const, total_minor: 50 },
    { month: '2026-10-01', kind: 'revenue' as const, total_minor: 400 },
    { month: '2026-10-05', kind: 'cash_balance' as const, total_minor: 10_000 },
  ];
  it('computes burn from the last 3 complete months and runway from average net burn', () => {
    const s = summarizeFinance(rows, NOW);
    expect(s.monthlyBurn).toBe(1100);         // (1000 + 1100 + 1200) / 3
    expect(s.netCashFlow).toBe(350);          // current month 400 - 50
    expect(s.cashBalance).toBe(10_000);
    expect(s.runwayMonths).toBeCloseTo(20);   // avg net = -500 → 10,000 / 500
    expect(s.burnChangePct).toBeCloseTo(9.09, 1);
  });
  it('reports infinite runway when cash-flow positive, and null without a balance', () => {
    const positive = rows.map((r) => (r.kind === 'revenue' ? { ...r, total_minor: 5000 } : r));
    expect(summarizeFinance(positive, NOW).runwayMonths).toBe(Infinity);
    expect(summarizeFinance(rows.filter((r) => r.kind !== 'cash_balance'), NOW).runwayMonths).toBeNull();
    expect(formatRunway(Infinity)).toBe('Cash-flow positive');
    expect(formatRunway(30)).toBe('24+ mo');
    expect(formatRunway(5.25)).toBe('5.3 mo');
  });
  it('flags categories over their trailing average', () => {
    const v = costVariances([
      { category: 'Cloud', amount_minor: 100, occurred_on: '2026-07-03', kind: 'expense' },
      { category: 'Cloud', amount_minor: 100, occurred_on: '2026-08-03', kind: 'expense' },
      { category: 'Cloud', amount_minor: 100, occurred_on: '2026-09-03', kind: 'expense' },
      { category: 'Cloud', amount_minor: 130, occurred_on: '2026-10-03', kind: 'expense' },
      { category: 'Travel', amount_minor: 100, occurred_on: '2026-09-03', kind: 'expense' },
      { category: 'Travel', amount_minor: 105, occurred_on: '2026-10-03', kind: 'expense' },
    ], NOW);
    expect(v).toHaveLength(1);
    expect(v[0].category).toBe('Cloud');
    expect(v[0].variancePct).toBeCloseTo(30);
  });
});

describe('sprint progress', () => {
  it('computes day x of y and on-track status', () => {
    const p = sprintProgress({ starts_on: '2026-10-01', ends_on: '2026-10-14', committed_points: 50 },
      [{ status: 'done', points: 20 }, { status: 'in_progress', points: 10 }, { status: 'blocked', points: 5 }], NOW);
    expect(p.day).toBe(8);
    expect(p.totalDays).toBe(14);
    expect(p.pct).toBe(40);
    expect(p.blocked).toBe(1);
    expect(['on_track', 'at_risk', 'behind']).toContain(p.status);
  });
});

describe('invoices', () => {
  it('derives overdue and due-today states', () => {
    expect(invoiceDisplayStatus({ status: 'sent', due_on: '2026-10-07' }, NOW)).toBe('overdue');
    expect(invoiceDisplayStatus({ status: 'sent', due_on: '2026-10-08' }, NOW)).toBe('due_today');
    expect(invoiceDisplayStatus({ status: 'paid', due_on: '2026-10-01' }, NOW)).toBe('paid');
    const s = unpaidSummary([
      { status: 'sent', due_on: '2026-10-08', amount_minor: 100 },
      { status: 'sent', due_on: '2026-10-01', amount_minor: 50 },
      { status: 'paid', due_on: '2026-10-01', amount_minor: 999 },
    ], NOW);
    expect(s).toEqual({ count: 2, total: 150, dueToday: 1, overdue: 1 });
  });
  it('numbers invoices sequentially per year', () => {
    expect(nextInvoiceNumber(['INV-2026-0009', 'INV-2025-0100'], 2026)).toBe('INV-2026-0010');
    expect(nextInvoiceNumber([], 2026)).toBe('INV-2026-0001');
  });
});

describe('compliance readiness', () => {
  it('excludes not-applicable controls', () => {
    const r = readiness([{ status: 'passing' }, { status: 'passing' }, { status: 'failing' }, { status: 'not_applicable' }]);
    expect(r.total).toBe(3);
    expect(r.pct).toBeCloseTo(66.7);
  });
  it('counts days until a date', () => {
    expect(daysUntil('2026-10-26', NOW)).toBe(18);
    expect(daysUntil(null, NOW)).toBeNull();
  });
});

describe('people metrics', () => {
  it('check-in rate and mood', () => {
    const c = [{ user_id: 'a', for_date: '2026-10-07', mood: 4 }, { user_id: 'b', for_date: '2026-10-07', mood: 2 }];
    expect(checkinRate(c, 4, 1)).toBe(0.5);
    expect(moodAverage(c)).toBe(3);
  });
  it('cognitive load and burnout risk', () => {
    const meetings = [{ id: 'm1', starts_at: '2026-10-05T14:00:00Z', duration_min: 60, mode: 'sync' as const },
      { id: 'm2', starts_at: '2026-10-06T14:00:00Z', duration_min: 30, mode: 'async_first' as const }];
    const parts = [{ meeting_id: 'm1', user_id: 'a' }, { meeting_id: 'm2', user_id: 'a' }, { meeting_id: 'm1', user_id: 'b' }];
    const members = [{ userId: 'a', timezone: 'UTC', workStart: '09:00', workEnd: '17:00' }, { userId: 'b', timezone: 'UTC', workStart: '09:00', workEnd: '17:00' }];
    const load = cognitiveLoad(meetings, parts, members, 7);
    expect(load.meetingHoursPerWeek).toBeCloseTo(1.25);
    expect(load.asyncShare).toBe(0.5);
    expect(load.deepWorkHoursPerWeek).toBeCloseTo(38.75);
    const hours = meetingHoursByUser(meetings, parts);
    expect(burnoutRisk([{ user_id: 'b', for_date: '2026-10-07', mood: 1 }], hours, ['a', 'b'], 1)).toBe(0.5);
  });
});

describe('money', () => {
  it('formats and parses minor units', () => {
    expect(formatMoney(123456, 'KES')).toBe('KES 1,234.56');
    expect(parseMoneyToMinor('1,250.5')).toBe(125050);
    expect(parseMoneyToMinor('12.345')).toBeNull();
    expect(parseMoneyToMinor('abc')).toBeNull();
  });
});
