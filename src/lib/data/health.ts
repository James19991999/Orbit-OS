import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHealth } from '@/lib/metrics/health';
import { sprintProgress } from '@/lib/metrics/sprint';
import { summarizeFinance, monthlyFromEntries } from '@/lib/metrics/finance';
import { moodAverage, checkinRate } from '@/lib/metrics/people';
import { readiness } from '@/lib/compliance/readiness';
import type { Organization, Sprint, Task, Control } from '@/lib/types';

/** Service-role version of the dashboard health computation (used by the daily snapshot cron). */
export async function computeOrgHealth(admin: SupabaseClient, org: Organization, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const since = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10);
  const [sp, fin, ci, ctrl, mem] = await Promise.all([
    admin.from('sprints').select('*').eq('org_id', org.id).lte('starts_on', today).gte('ends_on', today).limit(1),
    admin.from('finance_entries').select('kind, amount_minor, occurred_on, currency, approval_status, created_at').eq('org_id', org.id).gte('occurred_on', since(200)),
    admin.from('check_ins').select('user_id, for_date, mood').eq('org_id', org.id).gte('for_date', since(14)),
    admin.from('compliance_controls').select('status').eq('org_id', org.id),
    admin.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'active'),
  ]);
  const sprint = (sp.data as Sprint[] | null)?.[0];
  let sprintInput = null;
  if (sprint) {
    const { data: tasks } = await admin.from('tasks').select('status, points').eq('sprint_id', sprint.id);
    const p = sprintProgress(sprint, (tasks ?? []) as Pick<Task, 'status' | 'points'>[], now);
    sprintInput = { donePoints: p.done, committedPoints: p.committed, elapsedFraction: p.elapsedFraction };
  }
  const f = summarizeFinance(monthlyFromEntries((fin.data ?? []) as never[], org.currency), now);
  const c = (ci.data ?? []) as { user_id: string; for_date: string; mood: number }[];
  const r = readiness((ctrl.data ?? []) as Pick<Control, 'status'>[]);
  return computeHealth({
    sprint: sprintInput, runwayMonths: f.runwayMonths, moodAvg: moodAverage(c), checkinRate: checkinRate(c, mem.count ?? 0, 10),
    controls: r.total ? { passing: r.passing, applicable: r.total } : null,
  });
}
