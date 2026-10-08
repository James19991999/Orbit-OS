import type { SupabaseClient } from '@supabase/supabase-js';
import { periodRange, type PeriodKey } from './period';
import { summarizeFinance, monthlyFromEntries, type MonthlyRow } from '@/lib/metrics/finance';
import { readiness } from '@/lib/compliance/readiness';
import { checkinRate, moodAverage, meetingHoursByUser, burnoutRisk, tzHarmony, type MeetingLike } from '@/lib/metrics/people';
import { avgCycleDays } from '@/lib/metrics/sprint';
import { shiftInsights } from '@/lib/scheduling/insights';
import { toWindows } from '@/lib/data/members';
import type { Organization, Member, Sprint, Task, Control, Device, TrainingAssignment } from '@/lib/types';

const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
function err(what: string, e: { message: string } | null) { if (e) throw new Error(`Could not load ${what}: ${e.message}`); }

/**
 * Everything Reports needs, computed once. Used by the Reports page, PDF/CSV export, Slack dispatch and
 * the scheduled-digest cron (which passes a service-role client and `asService: true`).
 */
export async function loadReport(sb: SupabaseClient, org: Organization, periodKey: PeriodKey, opts: { asService?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const p = periodRange(periodKey, now);
  const iso = (d: Date) => d.toISOString();
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const memRes = await sb.from('memberships').select('user_id, role, title, department, status, created_at, profile:profiles(*)').eq('org_id', org.id).eq('status', 'active');
  err('members', memRes.error);
  const members = ((memRes.data ?? []) as unknown as Member[]).filter((m) => m.profile);
  const windows = toWindows(members);
  const wmap = new Map(windows.map((w) => [w.userId, w]));

  const [sprintsR, tasksR, prevTasksR, meetR, prevMeetR, ciR, payR, ctrlR, devR, campR, upcomingR, enpsR, finR] = await Promise.all([
    sb.from('sprints').select('*').eq('org_id', org.id).gte('ends_on', day(p.start)).lt('ends_on', day(p.end)),
    sb.from('tasks').select('id, points, created_at, completed_at, status, sprint_id').eq('org_id', org.id).gte('completed_at', iso(p.start)).lt('completed_at', iso(p.end)),
    sb.from('tasks').select('points').eq('org_id', org.id).gte('completed_at', iso(p.prevStart)).lt('completed_at', iso(p.prevEnd)),
    sb.from('meetings').select('id, starts_at, duration_min, mode, meeting_participants(meeting_id, user_id)').eq('org_id', org.id).gte('starts_at', iso(p.start)).lt('starts_at', iso(p.end)),
    sb.from('meetings').select('id, starts_at, duration_min, mode, meeting_participants(meeting_id, user_id)').eq('org_id', org.id).gte('starts_at', iso(p.prevStart)).lt('starts_at', iso(p.prevEnd)),
    sb.from('check_ins').select('user_id, for_date, mood').eq('org_id', org.id).gte('for_date', day(p.start)).lt('for_date', day(p.end)),
    sb.from('payroll_runs').select('country_count, total_minor, period').eq('org_id', org.id).order('period', { ascending: false }).limit(12),
    sb.from('compliance_controls').select('status').eq('org_id', org.id),
    sb.from('devices').select('encrypted, agent_installed').eq('org_id', org.id),
    sb.from('training_campaigns').select('id').eq('org_id', org.id).order('due_on', { ascending: false }).limit(1),
    sb.from('meetings').select('id, title, starts_at, duration_min, meeting_participants(user_id)').eq('org_id', org.id).gte('starts_at', iso(now)).lt('starts_at', iso(new Date(now.getTime() + 14 * 86_400_000))),
    sb.from('polls').select('id').eq('org_id', org.id).eq('kind', 'enps').order('created_at', { ascending: false }).limit(1),
    opts.asService
      ? sb.from('finance_entries').select('kind, amount_minor, occurred_on, currency, approval_status, created_at').eq('org_id', org.id).gte('occurred_on', day(new Date(now.getTime() - 400 * 86_400_000)))
      : sb.rpc('finance_monthly', { p_org: org.id, p_months: 12 }),
  ]);
  for (const [w, r] of [['sprints', sprintsR], ['tasks', tasksR], ['tasks', prevTasksR], ['meetings', meetR], ['meetings', prevMeetR], ['check-ins', ciR], ['payroll', payR], ['controls', ctrlR], ['devices', devR], ['training', campR], ['meetings', upcomingR], ['polls', enpsR], ['finance', finR]] as const) err(w, r.error);

  // ── Engineering & product ──
  const sprints = sprintsR.data as Sprint[];
  const done = tasksR.data as Pick<Task, 'id' | 'points' | 'created_at' | 'completed_at' | 'status' | 'sprint_id'>[];
  const donePts = done.reduce((a, t) => a + t.points, 0);
  const prevPts = (prevTasksR.data as { points: number }[]).reduce((a, t) => a + t.points, 0);
  const sprintStats = sprints.map((s) => {
    const pts = done.filter((t) => t.sprint_id === s.id).reduce((a, t) => a + t.points, 0);
    return { sprint: s, done: pts, onTarget: s.committed_points > 0 ? pts >= s.committed_points * 0.9 : true };
  });
  const committed = sprints.reduce((a, s) => a + s.committed_points, 0);
  const velocityIndex = committed > 0 ? Math.min(100, Math.round((sprintStats.reduce((a, s) => a + s.done, 0) / committed) * 1000) / 10) : null;

  // ── Sync load / async ──
  type M = MeetingLike & { meeting_participants: { meeting_id: string; user_id: string }[] };
  const meetings = meetR.data as M[]; const prevMeetings = prevMeetR.data as M[];
  const hours = (ms: M[]) => ms.reduce((a, m) => a + (m.duration_min / 60) * Math.max(1, m.meeting_participants.length), 0);
  const meetingHours = hours(meetings); const prevMeetingHours = hours(prevMeetings);
  const hoursSaved = prevMeetingHours - meetingHours;
  const asyncRate = meetings.length ? meetings.filter((m) => m.mode === 'async_first').length / meetings.length : null;

  // ── Finance ──
  const monthly = opts.asService ? monthlyFromEntries(finR.data as never[], org.currency) : (finR.data as MonthlyRow[]);
  const fin = summarizeFinance(monthly, now);
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const lastMonth = (end: Date) => month(new Date(end.getTime() - 1)); // end is exclusive
  const inPeriod = (m: string) => m >= month(p.start) && m <= lastMonth(p.end);
  const inPrev = (m: string) => m >= month(p.prevStart) && m <= lastMonth(p.prevEnd);
  const periodBurn = fin.months.filter((m) => inPeriod(m.month)).reduce((a, m) => a + m.burn, 0);
  const prevBurn = fin.months.filter((m) => inPrev(m.month)).reduce((a, m) => a + m.burn, 0);
  const periodRevenue = fin.months.filter((m) => inPeriod(m.month)).reduce((a, m) => a + m.revenue, 0);
  const payroll = payR.data as { country_count: number; total_minor: number; period: string }[];

  // ── People ──
  const checkins = ciR.data as { user_id: string; for_date: string; mood: number }[];
  const days = Math.max(1, Math.round((Math.min(p.end.getTime(), now.getTime()) - p.start.getTime()) / 86_400_000));
  const workdays = Math.max(1, Math.round(days * 5 / 7));
  const allParts = meetings.flatMap((m) => m.meeting_participants);
  const hoursByUser = meetingHoursByUser(meetings, allParts);
  let enps: number | null = null;
  const enpsPoll = (enpsR.data as { id: string }[])[0];
  if (enpsPoll) {
    const [{ data: opts2 }, { data: res }] = await Promise.all([
      sb.from('poll_options').select('id, label').eq('poll_id', enpsPoll.id),
      opts.asService ? sb.from('poll_votes').select('option_id').eq('poll_id', enpsPoll.id) : sb.rpc('poll_results', { p_poll: enpsPoll.id }),
    ]);
    const counts = new Map<string, number>();
    for (const r of (res ?? []) as { option_id: string; votes?: number }[]) counts.set(r.option_id, (counts.get(r.option_id) ?? 0) + (r.votes !== undefined ? Number(r.votes) : 1));
    const byLabel = (re: RegExp) => ((opts2 ?? []) as { id: string; label: string }[]).filter((o) => re.test(o.label)).reduce((a, o) => a + (counts.get(o.id) ?? 0), 0);
    const pro = byLabel(/promoter|9|10/i); const det = byLabel(/detractor|0-6|[0-6]\b/i); const total = [...counts.values()].reduce((a, b) => a + b, 0);
    enps = total ? Math.round(((pro - det) / total) * 100) : null;
  }

  // ── Infosec ──
  const controls = ctrlR.data as Pick<Control, 'status'>[];
  const devices = devR.data as Pick<Device, 'encrypted' | 'agent_installed'>[];
  let training: { done: number; total: number } | null = null;
  const camp = (campR.data as { id: string }[])[0];
  if (camp) {
    const { data: a } = await sb.from('training_assignments').select('completed_at').eq('campaign_id', camp.id);
    const rows = (a ?? []) as Pick<TrainingAssignment, 'completed_at'>[];
    training = { done: rows.filter((r) => r.completed_at).length, total: rows.length };
  }

  // ── Chrono-optimizer ──
  const upcoming = (upcomingR.data as { id: string; title: string; starts_at: string; duration_min: number; meeting_participants: { user_id: string }[] }[])
    .map((m) => ({ ...m, participantIds: m.meeting_participants.map((x) => x.user_id) }));
  const insights = shiftInsights(upcoming, wmap).slice(0, 3);

  return {
    period: p, generatedAt: now, org: { name: org.name, currency: org.currency, hourlyCostMinor: Number(org.hourly_cost_minor) },
    eng: { sprintsClosed: sprints.length, onTarget: sprintStats.filter((s) => s.onTarget).length, donePoints: donePts, pointsChangePct: pct(donePts, prevPts), velocityIndex, avgCycleDays: avgCycleDays(done as { created_at: string; completed_at: string | null }[]) },
    sync: { meetingHours, prevMeetingHours, hoursSaved, costDiffMinor: Math.round(hoursSaved * Number(org.hourly_cost_minor)), asyncRate, meetings: meetings.length },
    finance: { ...fin, periodBurn, prevBurn, burnChangePct: pct(periodBurn, prevBurn), periodRevenue, payrollTerritories: payroll[0]?.country_count ?? null },
    people: { members: members.length, checkinRate: checkinRate(checkins, members.length, workdays), mood: moodAverage(checkins), burnoutRisk: burnoutRisk(checkins, hoursByUser, members.map((m) => m.user_id), days / 7), tzHarmony: tzHarmony(meetings, allParts, wmap), enps },
    infosec: { controls: readiness(controls as { status: Control['status'] }[]), devices: { compliant: devices.filter((d) => d.encrypted && d.agent_installed).length, total: devices.length }, training },
    insights,
  };
}

export type Report = Awaited<ReturnType<typeof loadReport>>;
