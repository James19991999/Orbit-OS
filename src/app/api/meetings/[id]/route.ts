import { handler, json, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { removeMeetingEverywhere } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Cancel a meeting: remove it from everyone's connected calendar, then delete it. */
export const DELETE = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const { id } = await route.params;
  const ctx = await requireApiContext({ writable: true, roles: ['owner', 'director', 'contributor'] });
  const { data: m } = await ctx.supabase.from('meetings').select('id, title, organizer_id').eq('id', id).eq('org_id', ctx.org.id).maybeSingle();
  if (!m) throw new ApiError(404, 'Meeting not found');
  if (m.organizer_id !== ctx.user.id && !['owner', 'director'].includes(ctx.role)) throw new ApiError(403, 'Only the organizer or a director can cancel this meeting');
  const admin = getAdminClient();
  const removed = await removeMeetingEverywhere(admin, id);
  const { error } = await admin.from('meetings').delete().eq('id', id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'meeting.cancelled', { type: 'meeting', id }, { title: m.title, removedFromCalendars: removed });
  return json({ ok: true, removedFromCalendars: removed });
});
