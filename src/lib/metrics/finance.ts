export interface MonthlyRow {
  month: string;   // yyyy-mm-dd (first of month) — or the entry date for cash_balance
  kind: 'expense' | 'revenue' | 'payroll' | 'cash_balance';
  total_minor: number;
}

export interface FinanceSummary {
  cashBalance: number | null;
  monthlyBurn: number;          // avg (expense + payroll) over the last 3 complete months
  burnChangePct: number | null; // last complete month vs the one before
  netCashFlow: number;          // current month revenue - (expense + payroll)
  netCashFlowChangePct: number | null;
  runwayMonths: number | null;  // Infinity when net cash flow is positive on average
  months: { month: string; burn: number; revenue: number; net: number }[];
}

const monthKey = (d: string) => d.slice(0, 7);

export function summarizeFinance(rows: MonthlyRow[], today: Date = new Date()): FinanceSummary {
  const current = today.toISOString().slice(0, 7);
  const byMonth = new Map<string, { burn: number; revenue: number }>();
  let cashBalance: number | null = null;
  for (const r of rows) {
    const amount = Number(r.total_minor);
    if (r.kind === 'cash_balance') { cashBalance = amount; continue; }
    const k = monthKey(r.month);
    const m = byMonth.get(k) ?? { burn: 0, revenue: 0 };
    if (r.kind === 'revenue') m.revenue += amount; else m.burn += amount;
    byMonth.set(k, m);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, burn: v.burn, revenue: v.revenue, net: v.revenue - v.burn }));
  const complete = months.filter((m) => m.month < current);
  const last3 = complete.slice(-3);
  const monthlyBurn = last3.length ? Math.round(last3.reduce((a, m) => a + m.burn, 0) / last3.length) : 0;
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
  const lastTwo = complete.slice(-2);
  const burnChangePct = lastTwo.length === 2 ? pct(lastTwo[1].burn, lastTwo[0].burn) : null;
  const cur = months.find((m) => m.month === current);
  const prev = complete[complete.length - 1];
  const netCashFlow = cur ? cur.net : 0;
  const netCashFlowChangePct = cur && prev ? pct(cur.net, prev.net) : null;
  const avgNet = last3.length ? last3.reduce((a, m) => a + m.net, 0) / last3.length : 0;
  let runwayMonths: number | null = null;
  if (cashBalance !== null) {
    runwayMonths = avgNet >= 0 ? Infinity : cashBalance / -avgNet;
  }
  return { cashBalance, monthlyBurn, burnChangePct, netCashFlow, netCashFlowChangePct, runwayMonths, months };
}

export function formatRunway(months: number | null): string {
  if (months === null) return '—';
  if (!Number.isFinite(months)) return 'Cash-flow positive';
  if (months >= 24) return '24+ mo';
  return `${months.toFixed(1)} mo`;
}

export interface CategoryEntry { category: string | null; amount_minor: number; occurred_on: string; kind: string }

/** Flags expense categories whose current-month spend exceeds the trailing 3-month average by > threshold. */
export function costVariances(entries: CategoryEntry[], today: Date = new Date(), threshold = 0.1) {
  const current = today.toISOString().slice(0, 7);
  const totals = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (e.kind !== 'expense') continue;
    const cat = e.category || 'Uncategorised';
    const m = e.occurred_on.slice(0, 7);
    const c = totals.get(cat) ?? new Map<string, number>();
    c.set(m, (c.get(m) ?? 0) + Number(e.amount_minor));
    totals.set(cat, c);
  }
  const out: { category: string; current: number; average: number; variancePct: number }[] = [];
  for (const [category, byMonth] of totals) {
    const prior = [...byMonth.entries()].filter(([m]) => m < current).sort(([a], [b]) => a.localeCompare(b)).slice(-3);
    if (prior.length === 0) continue;
    const average = prior.reduce((a, [, v]) => a + v, 0) / prior.length;
    const cur = byMonth.get(current) ?? 0;
    if (average > 0 && cur > average * (1 + threshold)) {
      out.push({ category, current: cur, average: Math.round(average), variancePct: ((cur - average) / average) * 100 });
    }
  }
  return out.sort((a, b) => b.variancePct - a.variancePct);
}

/** Same shape as the finance_monthly() RPC, computed from raw (approved) ledger rows — used by service-role jobs. */
export function monthlyFromEntries(entries: { kind: string; amount_minor: number; occurred_on: string; currency: string; approval_status?: string; created_at?: string }[], currency: string): MonthlyRow[] {
  const rows = new Map<string, number>();
  let latest: { on: string; at: string; amount: number } | null = null;
  for (const e of entries) {
    if (e.currency !== currency || (e.approval_status && e.approval_status !== 'approved')) continue;
    if (e.kind === 'cash_balance') {
      const at = e.created_at ?? '';
      if (!latest || e.occurred_on > latest.on || (e.occurred_on === latest.on && at > latest.at)) latest = { on: e.occurred_on, at, amount: Number(e.amount_minor) };
      continue;
    }
    const key = `${e.occurred_on.slice(0, 7)}-01|${e.kind}`;
    rows.set(key, (rows.get(key) ?? 0) + Number(e.amount_minor));
  }
  const out: MonthlyRow[] = [...rows.entries()].map(([k, v]) => { const [month, kind] = k.split('|'); return { month, kind: kind as MonthlyRow['kind'], total_minor: v }; });
  if (latest) out.push({ month: latest.on, kind: 'cash_balance', total_minor: latest.amount });
  return out;
}
