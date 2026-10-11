import { handler, json, requireApiContext, rateLimit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { busyFor } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Busy times (start/end only) from the connected calendars of teammates in this workspace. */
export const GET = handler(async (req) => {
  const ctx = await requireApiContext();
  await rateLimit('calendar-busy', ctx.user.id, 60, 60);
  const asked = (req.nextUrl.searchParams.get('users') ?? '').split(',').filter((u) => /^[0-9a-f-]{36}$/.test(u)).slice(0, 50);
  const { data: members } = await ctx.supabase.from('memberships').select('user_id').eq('org_id', ctx.org.id).eq('status', 'active');
  const allowed = new Set((members ?? []).map((m) => m.user_id as string));
  const ids = (asked.length ? asked : [...allowed]).filter((u) => allowed.has(u));
  return json(await busyFor(getAdminClient(), ids), 200, { 'cache-control': 'private, no-store' });
});
