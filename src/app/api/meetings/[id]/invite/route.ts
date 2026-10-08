import { handler, json, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { buildIcs } from '@/lib/ics';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { formatInTimeZone } from 'date-fns-tz';
import type { Meeting } from '@/lib/types';
import { loadProfiles } from '@/lib/data/profiles';

export const dynamic = 'force-dynamic';

/** Emails each participant an .ics calendar invite (works with Google Calendar and Outlook). */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ writable: true, roles: ['owner', 'director', 'contributor'] });
  await rateLimit('meeting-invite', ctx.user.id, 30, 60);
  const { data: m } = await ctx.supabase.from('meetings').select('*').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (!m) throw new ApiError(404, 'Meeting not found');
  const meeting = m as Meeting;
  if (meeting.organizer_id !== ctx.user.id && !['owner', 'director'].includes(ctx.role)) throw new ApiError(403, 'Only the organizer can send invites');
  // meeting_participants.user_id references auth.users, not profiles, so profiles are loaded separately.
  const { data: parts, error } = await ctx.supabase.from('meeting_participants').select('user_id').eq('meeting_id', meeting.id);
  if (error) throw new ApiError(500, error.message);
  const ids = (parts ?? []).map((p: { user_id: string }) => p.user_id);
  const byId = await loadProfiles(ctx.supabase, ids);
  const people = ids.map((id) => ({ user_id: id, profile: byId.get(id) ?? null }));
  if (!isEmailConfigured()) return json({ emailed: 0, notConfigured: true });
  const organizer = people.find((p) => p.user_id === meeting.organizer_id)?.profile;
  const attendees = people.filter((p) => p.profile?.email).map((p) => ({ name: p.profile!.full_name, email: p.profile!.email! }));
  const ics = buildIcs({ uid: meeting.id, title: meeting.title, description: meeting.description, start: new Date(meeting.starts_at), durationMin: meeting.duration_min,
    url: meeting.video_url, organizer: organizer?.email ? { name: organizer.full_name, email: organizer.email } : null, attendees });
  let emailed = 0;
  for (const p of people) {
    if (!p.profile?.email || p.user_id === ctx.user.id) continue;
    const local = formatInTimeZone(meeting.starts_at, p.profile.timezone || 'UTC', "EEEE d MMMM 'at' HH:mm zzz");
    const r = await sendEmail({
      to: p.profile.email, subject: `Invitation: ${meeting.title} — ${local}`,
      html: emailLayout(meeting.title, `<p>${escapeHtml(organizer?.full_name ?? 'A teammate')} invited you to <strong>${escapeHtml(meeting.title)}</strong>.</p><p><strong>${escapeHtml(local)}</strong> (your time) · ${meeting.duration_min} minutes${meeting.mode === 'async_first' ? ' · async-first' : ''}</p>${meeting.description ? `<p>${escapeHtml(meeting.description)}</p>` : ''}<p>The attached .ics adds it to your calendar.</p>`,
        meeting.video_url ? { label: 'Join video call', url: meeting.video_url } : undefined),
      attachments: [{ filename: 'invite.ics', content: Buffer.from(ics) }],
    });
    if (r.sent) emailed++;
  }
  await audit(req, ctx.org.id, ctx.user.id, 'meeting.invites_sent', { type: 'meeting', id: meeting.id }, { emailed });
  return json({ emailed, notConfigured: false });
});
