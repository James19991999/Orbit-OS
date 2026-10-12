import { fromZonedTime } from 'date-fns-tz';
import { handler, json, requireApiContext, rateLimit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { busyFor } from '@/lib/calendar/service';
import type { AwayRow } from '@/lib/leave';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Busy times (start/end only) for teammates in this workspace: from connected calendars, plus approved time off
 * (whole days in each person's own time zone), so the slot finder never suggests a time when someone is on leave.
 */
export const GET = handler(async (req) => {
  const ctx = await requireApiContext();
  await rateLimit('calendar-busy', ctx.user.id, 60, 60);
  const asked = (req.nextUrl.searchParams.get('users') ?? '').split(',').filter((u) => /^[0-9a-f-]{36}$/.test(u)).slice(0, 50);
  const { data: members } = await ctx.supabase.from('memberships').select('user_id, profile:profiles(timezone)').eq('org_id', ctx.org.id).eq('status', 'active');
  const tz = new Map(((members ?? []) as unknown as { user_id: string; profile: { timezone: string } | null }[]).map((m) => [m.user_id, m.profile?.timezone || 'UTC']));
  const ids = (asked.length ? asked : [...tz.keys()]).filter((u) => tz.has(u));
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  const [cal, away] = await Promise.all([
    busyFor(getAdminClient(), ids),
    ctx.supabase.rpc('team_away', { p_org: ctx.org.id, p_from: from, p_to: to }).then((r) => (r.data ?? []) as AwayRow[], () => [] as AwayRow[]),
  ]);
  const busy = cal.busy;
  for (const a of away) {
    if (!ids.includes(a.user_id)) continue;
    const zone = tz.get(a.user_id)!;
    const end = new Date(Date.UTC(+a.ends_on.slice(0, 4), +a.ends_on.slice(5, 7) - 1, +a.ends_on.slice(8, 10) + 1)).toISOString().slice(0, 10);
    (busy[a.user_id] ??= []).push({ start: fromZonedTime(`${a.starts_on}T00:00:00`, zone).getTime(), end: fromZonedTime(`${end}T00:00:00`, zone).getTime() });
  }
  return json({ busy, connected: cal.connected, away: [...new Set(away.map((a) => a.user_id))] }, 200, { 'cache-control': 'private, no-store' });
});
