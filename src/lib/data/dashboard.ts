import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeFinance, costVariances, type MonthlyRow } from '@/lib/metrics/finance';
import { computeHealth } from '@/lib/metrics/health';
import { sprintProgress } from '@/lib/metrics/sprint';
import { moodAverage, checkinRate } from '@/lib/metrics/people';
import { readiness } from '@/lib/compliance/readiness';
import { unpaidSummary, invoiceDisplayStatus } from '@/lib/metrics/invoices';
import { goldenOverlap, utcMidnight } from '@/lib/scheduling/overlap';
import { loadMembers, toWindows, isoDaysAgo, must } from './members';
import { can } from '@/lib/roles';
import type { Organization, Role, Sprint, Task, CheckIn, Control, Invoice, FinanceEntry, Meeting, Dsar } from '@/lib/types';

export interface UrgentItem { id: string; area: string; tone: 'alert' | 'warning' | 'info'; title: string; body: string; when: string; cta: string; href: string }

export async function loadDashboard(supabase: SupabaseClient, org: Organization, role: Role, userId: string, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const members = await loadMembers(supabase, org.id);
  const [sprintRes, financeRes, checkinsRes, controlsRes, tasksRes, snapshotsRes, invoicesRes, expensesRes, meetingsRes, dsarRes, pendingRes] = await Promise.all([
    supabase.from('sprints').select('*').eq('org_id', org.id).lte('starts_on', today).gte('ends_on', today).order('starts_on', { ascending: false }).limit(1),
    supabase.rpc('finance_monthly', { p_org: org.id, p_months: 6 }),
    supabase.from('check_ins').select('user_id, for_date, mood').eq('org_id', org.id).gte('for_date', isoDaysAgo(30, now)),
    supabase.from('compliance_controls').select('id, status, ref, title, framework_id').eq('org_id', org.id),
    supabase.from('tasks').select('*').eq('org_id', org.id).neq('status', 'done').or(`status.eq.blocked,due_on.lt.${today}`).order('due_on', { ascending: true }).limit(20),
    supabase.from('health_snapshots').select('taken_on, score').eq('org_id', org.id).lte('taken_on', isoDaysAgo(14, now)).order('taken_on', { ascending: false }).limit(1),
    can.seeFinance(role) ? supabase.from('invoices').select('*').eq('org_id', org.id).eq('status', 'sent') : Promise.resolve({ data: [], error: null }),
    can.seeFinance(role) ? supabase.from('finance_entries').select('category, amount_minor, occurred_on, kind').eq('org_id', org.id).eq('kind', 'expense').eq('approval_status', 'approved').gte('occurred_on', isoDaysAgo(120, now)) : Promise.resolve({ data: [], error: null }),
    supabase.from('meetings').select('*, meeting_participants!inner(user_id)').eq('org_id', org.id).eq('meeting_participants.user_id', userId)
      .gte('starts_at', new Date(now.getTime() - 15 * 60_000).toISOString()).lte('starts_at', new Date(now.getTime() + 90 * 60_000).toISOString()),
    supabase.from('dsar_requests').select('*').eq('org_id', org.id).neq('status', 'closed').lte('due_on', isoDaysAgo(-7, now)),
    can.manage(role) ? supabase.from('finance_entries').select('*').eq('org_id', org.id).eq('approval_status', 'pending') : Promise.resolve({ data: [], error: null }),
  ]);

  const sprint = (must(sprintRes, 'sprint') as Sprint[])[0] ?? null;
  let sprintInfo: ReturnType<typeof sprintProgress> | null = null;
  let sprintTasks: Task[] = [];
  if (sprint) {
    sprintTasks = must(await supabase.from('tasks').select('*').eq('sprint_id', sprint.id), 'sprint tasks') as Task[];
    sprintInfo = sprintProgress(sprint, sprintTasks, now);
  }
  const finance = summarizeFinance(must(financeRes, 'finance summary') as MonthlyRow[], now);
  const checkins = must(checkinsRes, 'check-ins') as Pick<CheckIn, 'user_id' | 'for_date' | 'mood'>[];
  const last14 = checkins.filter((c) => c.for_date >= isoDaysAgo(14, now));
  const last7 = checkins.filter((c) => c.for_date >= isoDaysAgo(7, now));
  const mood14 = moodAverage(last14);
  const rate14 = checkinRate(last14, members.length, 10); // ~10 working days in 14
  const controls = must(controlsRes, 'controls') as Pick<Control, 'id' | 'status' | 'ref' | 'title' | 'framework_id'>[];
  const ready = readiness(controls);

  const health = computeHealth({
    sprint: sprintInfo ? { donePoints: sprintInfo.done, committedPoints: sprintInfo.committed, elapsedFraction: sprintInfo.elapsedFraction } : null,
    runwayMonths: finance.runwayMonths,
    moodAvg: mood14,
    checkinRate: rate14,
    controls: ready.total ? { passing: ready.passing, applicable: ready.total } : null,
  });
  const prevSnap = (must(snapshotsRes, 'health history') as { score: number }[])[0];

  // ── urgent actions, computed from real data ──
  const urgent: UrgentItem[] = [];
  for (const m of must(meetingsRes, 'meetings') as Meeting[]) {
    const mins = Math.round((new Date(m.starts_at).getTime() - now.getTime()) / 60_000);
    urgent.push({ id: `m-${m.id}`, area: 'Scheduling', tone: 'info', title: m.title, body: m.description ?? `${m.duration_min}-minute ${m.mode === 'async_first' ? 'async-first ' : ''}sync`,
      when: mins <= 0 ? 'Happening now' : `Starts in ${mins}m`, cta: 'Join', href: m.video_url ?? `/scheduling/meetings/${m.id}` });
  }
  for (const t of must(tasksRes, 'tasks') as Task[]) {
    const blocked = t.status === 'blocked';
    urgent.push({ id: `t-${t.id}`, area: 'Operations', tone: blocked ? 'alert' : 'warning', title: t.title,
      body: blocked ? `Blocked: ${t.blocked_reason ?? 'no reason given'}` : `Overdue since ${t.due_on}`,
      when: blocked ? 'Blocked' : 'Overdue', cta: 'Review', href: `/operations/tasks/${t.id}` });
  }
  for (const c of controls.filter((x) => x.status === 'failing')) {
    urgent.push({ id: `c-${c.id}`, area: 'Compliance', tone: 'alert', title: `${c.ref} failing`, body: c.title, when: 'Failing', cta: 'Fix', href: `/compliance/frameworks/${c.framework_id}` });
  }
  for (const d of must(dsarRes, 'DSARs') as Dsar[]) {
    urgent.push({ id: `d-${d.id}`, area: 'Legal / Trust', tone: 'warning', title: `GDPR ${d.type} request`, body: d.requester_email, when: `Due ${d.due_on}`, cta: 'Handle', href: '/compliance#dsar' });
  }
  for (const i of must(invoicesRes, 'invoices') as Invoice[]) {
    const st = invoiceDisplayStatus(i, now);
    if (st === 'due_today' || st === 'overdue') {
      urgent.push({ id: `i-${i.id}`, area: 'Finance Ops', tone: st === 'overdue' ? 'alert' : 'warning', title: `Invoice ${i.number}`, body: i.client_name,
        when: st === 'overdue' ? 'Overdue' : 'Due today', cta: 'Review', href: `/operations/invoices/${i.id}` });
    }
  }
  for (const v of costVariances(must(expensesRes, 'expenses') as Pick<FinanceEntry, 'category' | 'amount_minor' | 'occurred_on' | 'kind'>[], now)) {
    urgent.push({ id: `v-${v.category}`, area: 'Finance Ops', tone: 'warning', title: `${v.category} spend +${v.variancePct.toFixed(0)}% variance`,
      body: 'This month is above the trailing 3-month average.', when: 'This month', cta: 'Review', href: '/operations?tab=finance' });
  }
  for (const p of must(pendingRes, 'approvals') as FinanceEntry[]) {
    urgent.push({ id: `p-${p.id}`, area: 'Finance Ops', tone: 'info', title: `Approve ${p.vendor ?? p.category ?? 'expense'}`, body: p.note ?? 'Expense awaiting approval',
      when: 'Pending', cta: 'Approve', href: '/operations?tab=finance#approvals' });
  }
  const order = { alert: 0, warning: 1, info: 2 };
  urgent.sort((a, b) => order[a.tone] - order[b.tone]);

  const overlap = goldenOverlap(toWindows(members), utcMidnight(now.getTime()), Number(org.golden_overlap_min_hours));
  const tasksAll = must(tasksRes, 'tasks') as Task[];
  return {
    members, sprint, sprintInfo, finance, health, prevScore: prevSnap?.score ?? null,
    mood7: moodAverage(last7), mood30: moodAverage(checkins), rate14, ready, urgent,
    overlap, blockedCount: tasksAll.filter((t) => t.status === 'blocked').length,
    unpaid: unpaidSummary(must(invoicesRes, 'invoices') as Invoice[], now),
    timezones: new Set(members.map((m) => m.profile.timezone)).size,
  };
}
