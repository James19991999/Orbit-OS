import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { syncMeeting } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';

/** Applies a chrono-optimizer suggestion to one meeting — only after the user confirmed it in the UI. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ writable: true, roles: ['owner', 'director', 'contributor'] });
  const { meetingId, newStart } = await parseBody(req, z.object({ meetingId: z.string().uuid(), newStart: z.string().datetime() }));
  const { data: m } = await ctx.supabase.from('meetings').select('id, organizer_id, starts_at').eq('id', meetingId).eq('org_id', ctx.org.id).maybeSingle();
  if (!m) throw new ApiError(404, 'Meeting not found');
  if (m.organizer_id !== ctx.user.id && !['owner', 'director'].includes(ctx.role)) throw new ApiError(403, 'Only the organizer or a director can move this meeting');
  const shift = Math.abs(new Date(newStart).getTime() - new Date(m.starts_at).getTime());
  if (shift > 2 * 3_600_000) throw new ApiError(400, 'Suggestions only move meetings by up to 2 hours');
  const { error } = await ctx.supabase.from('meetings').update({ starts_at: newStart }).eq('id', meetingId);
  if (error) throw new ApiError(500, error.message);
  // Move it in people's connected calendars too.
  if (hasServiceRole()) await syncMeeting(getAdminClient(), meetingId).catch((e) => console.error('[calendar] reschedule', meetingId, (e as Error).message));
  await audit(req, ctx.org.id, ctx.user.id, 'meeting.rescheduled', { type: 'meeting', id: meetingId }, { from: m.starts_at, to: newStart, source: 'chrono_optimizer' });
  return json({ ok: true });
});
