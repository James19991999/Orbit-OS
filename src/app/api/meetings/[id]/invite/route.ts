import { handler, json, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { buildIcs } from '@/lib/ics';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { makeT, isLanguage } from '@/i18n';
import { formatSlot } from '@/lib/locale/conventions';
import { zoneAbbrev } from '@/lib/scheduling/time';
import type { Meeting } from '@/lib/types';
import { loadProfiles } from '@/lib/data/profiles';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { syncMeeting } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';

/**
 * Puts the meeting straight into the calendar of everyone who connected Google Calendar or Outlook, and emails
 * everyone else an .ics invite (which also works with Google Calendar and Outlook).
 */
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
  let synced = new Set<string>();
  if (hasServiceRole()) {
    try { synced = (await syncMeeting(getAdminClient(), meeting.id)).synced; } catch (e) { console.error('[calendar] sync', meeting.id, (e as Error).message); }
  }
  if (!isEmailConfigured()) return json({ emailed: 0, calendarSynced: synced.size, notConfigured: true });
  const organizer = people.find((p) => p.user_id === meeting.organizer_id)?.profile;
  const attendees = people.filter((p) => p.profile?.email).map((p) => ({ name: p.profile!.full_name, email: p.profile!.email! }));
  const ics = buildIcs({ uid: meeting.id, title: meeting.title, description: meeting.description, start: new Date(meeting.starts_at), durationMin: meeting.duration_min,
    url: meeting.video_url, organizer: organizer?.email ? { name: organizer.full_name, email: organizer.email } : null, attendees });
  let emailed = 0;
  for (const p of people) {
    if (!p.profile?.email || p.user_id === ctx.user.id || synced.has(p.user_id)) continue;
    const lang = isLanguage(p.profile.language) ? p.profile.language : 'en';
    const t = makeT(lang);
    const tz = p.profile.timezone || 'UTC';
    const local = `${formatSlot(meeting.starts_at, tz, lang)} ${zoneAbbrev(new Date(meeting.starts_at).getTime(), tz)}`;
    const r = await sendEmail({
      to: p.profile.email, subject: t('email.meet.subject', { title: meeting.title, when: local }),
      html: emailLayout(meeting.title, `<p>${t('email.meet.invited', { name: escapeHtml(organizer?.full_name ?? t('email.meet.teammate')), title: `<strong>${escapeHtml(meeting.title)}</strong>` })}</p><p>${t('email.meet.when', { when: `<strong>${escapeHtml(local)}</strong>`, n: meeting.duration_min })}${meeting.mode === 'async_first' ? t('email.meet.async') : ''}</p>${meeting.description ? `<p>${escapeHtml(meeting.description)}</p>` : ''}<p>${t('email.meet.ics')}</p>`,
        meeting.video_url ? { label: t('email.meet.join'), url: meeting.video_url } : undefined, t('email.footer')),
      attachments: [{ filename: 'invite.ics', content: Buffer.from(ics) }],
    });
    if (r.sent) emailed++;
  }
  await audit(req, ctx.org.id, ctx.user.id, 'meeting.invites_sent', { type: 'meeting', id: meeting.id }, { emailed, calendarSynced: synced.size });
  return json({ emailed, calendarSynced: synced.size, notConfigured: false });
});
