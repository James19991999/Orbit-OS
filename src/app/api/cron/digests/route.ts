import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { isDue, runDigest } from '@/lib/reports/digest';
import { planAllows } from '@/lib/billing/plans';
import type { Organization, ReportSchedule } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = handler(async (req) => {
  requireCronSecret(req);
  const admin = getAdminClient();
  const { data, error } = await admin.from('report_schedules').select('*, org:organizations(*)').eq('enabled', true);
  if (error) throw new Error(error.message);
  const results: { id: string; status: string }[] = [];
  for (const row of (data ?? []) as (ReportSchedule & { org: Organization })[]) {
    if (!isDue(row) || row.org.status !== 'active' || !planAllows(row.org.plan, 'scheduledDigests')) continue;
    const r = await runDigest(admin, row.org, row, { asService: true }).catch((e: Error) => ({ ok: false, status: e.message }));
    await admin.from('report_schedules').update({ last_run_at: new Date().toISOString(), last_status: r.status }).eq('id', row.id);
    results.push({ id: row.id, status: r.status });
  }
  return json({ ran: results.length, results });
});
