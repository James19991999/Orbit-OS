import { handler, json, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { runDigest } from '@/lib/reports/digest';
import { getAdminClient } from '@/lib/supabase/admin';
import type { ReportSchedule } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** "Send now" — sends the digest now and records the real outcome. */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director'] });
  await rateLimit('digest-run', ctx.user.id, 5, 60);
  const { data } = await ctx.supabase.from('report_schedules').select('*').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (!data) throw new ApiError(404, 'Schedule not found');
  const r = await runDigest(ctx.supabase, ctx.org, data as ReportSchedule);
  await getAdminClient().from('report_schedules').update({ last_run_at: new Date().toISOString(), last_status: r.status }).eq('id', params.id);
  await audit(req, ctx.org.id, ctx.user.id, 'report.dispatched', { type: 'report_schedule', id: params.id }, { ok: r.ok, status: r.status });
  return json(r, r.ok ? 200 : 502);
});
