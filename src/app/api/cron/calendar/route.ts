import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { refreshBusy, type Connection } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly: refresh busy times for connected calendars (so the slot finder is fast and current). */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const admin = getAdminClient();
  const { data, error } = await admin.from('calendar_connections').select('*').eq('status', 'active')
    .or(`busy_synced_at.is.null,busy_synced_at.lt.${new Date(Date.now() - 45 * 60_000).toISOString()}`).limit(300);
  if (error) throw new Error(error.message);
  let ok = 0; let failed = 0;
  const rows = (data ?? []) as Connection[];
  for (let i = 0; i < rows.length; i += 5) {
    const r = await Promise.all(rows.slice(i, i + 5).map((c) => refreshBusy(admin, c)));
    ok += r.filter(Boolean).length; failed += r.filter((x) => !x).length;
  }
  return json({ refreshed: ok, failed });
});
