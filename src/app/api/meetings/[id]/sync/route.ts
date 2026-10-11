import { handler, json, requireApiContext, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { syncMeeting } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** After an RSVP: add the meeting to (or take it out of) participants' connected calendars. */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, route) => {
  const { id } = await route.params;
  const ctx = await requireApiContext();
  const { data: part } = await ctx.supabase.from('meeting_participants').select('user_id').eq('meeting_id', id).eq('user_id', ctx.user.id).maybeSingle();
  const { data: m } = await ctx.supabase.from('meetings').select('organizer_id').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!m) throw new ApiError(404, 'Meeting not found');
  if (!part && m.organizer_id !== ctx.user.id) throw new ApiError(403, 'You are not part of this meeting');
  const r = await syncMeeting(getAdminClient(), id);
  return json({ synced: r.synced.size });
});
