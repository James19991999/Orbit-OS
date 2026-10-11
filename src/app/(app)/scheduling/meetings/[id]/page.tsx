import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { requireAppContext } from '@/lib/context';
import { loadMembers, toWindows } from '@/lib/data/members';
import { isWithinWorkingHours } from '@/lib/scheduling/time';
import { googleCalendarUrl } from '@/lib/ics';
import { can } from '@/lib/roles';
import { Card, Icon, Pill, Avatar } from '@/components/ui';
import { MeetingActions } from '@/components/scheduling/MeetingActions';
import type { Meeting } from '@/lib/types';
import { getT } from '@/i18n/server';
import { getFormat } from '@/lib/locale/server';
import type { MessageKey } from '@/i18n/shared';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.mtg.title') };
}

export default async function MeetingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [{ supabase, org, profile, user, role }, t, fmt] = await Promise.all([requireAppContext(), getT(), getFormat()]);
  const { data } = await supabase.from('meetings').select('*, meeting_participants(user_id, rsvp)').eq('id', params.id).eq('org_id', org.id).maybeSingle();
  if (!data) notFound();
  const m = data as Meeting & { meeting_participants: { user_id: string; rsvp: 'pending' | 'yes' | 'no' | 'maybe' }[] };
  const members = await loadMembers(supabase, org.id);
  const windows = toWindows(members);
  const start = new Date(m.starts_at).getTime();
  const mine = m.meeting_participants.find((p) => p.user_id === user.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/scheduling" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />{t('p.mtg.back')}</Link>
      <Card>
        <div className="flex flex-wrap gap-2">{m.mode === 'async_first' ? <Pill tone="info">{t('p.sch.async_first')}</Pill> : <Pill tone="neutral">{t('p.mtg.live_sync')}</Pill>}</div>
        <h1 className="mt-2 text-headline-lg-mobile md:text-headline-lg">{m.title}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant tnum">{t('p.mtg.when', { when: `${fmt.date(start, 'long')} · ${formatInTimeZone(start, profile.timezone, 'HH:mm')}`, n: m.duration_min })}</p>
        {m.description && <p className="mt-3 whitespace-pre-wrap text-body-lg">{m.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {m.video_url && <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded bg-primary-container px-4 text-label-md text-white"><Icon name="videocam" className="text-[18px]" />{t('p.mtg.join_video')}</a>}
          {m.loom_url && <a href={m.loom_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant px-4 text-label-md"><Icon name="play_circle" className="text-[18px]" />{t('p.mtg.recording')}</a>}
          <a href={`/api/meetings/${m.id}/ics`} className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant px-4 text-label-md"><Icon name="download" className="text-[18px]" />{t('p.mtg.ics')}</a>
          <a href={googleCalendarUrl({ title: m.title, description: m.description, start: new Date(start), durationMin: m.duration_min, url: m.video_url })} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant px-4 text-label-md"><Icon name="calendar_add_on" className="text-[18px]" />{t('p.mtg.add_google')}</a>
        </div>
        <h2 className="mt-6 text-headline-sm">{t('p.mtg.participants')}</h2>
        <ul className="mt-2 divide-y divide-outline-variant">
          {m.meeting_participants.map((p) => {
            const w = windows.find((x) => x.userId === p.user_id);
            const inside = w ? isWithinWorkingHours(w, start, start + m.duration_min * 60_000) : true;
            return (
              <li key={p.user_id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2"><Avatar name={w?.name ?? t('p.mtg.member')} size={28} /><span>{w?.name ?? t('p.mtg.former')}{p.user_id === m.organizer_id && <span className="text-on-surface-variant"> · {t('p.mtg.organizer')}</span>}</span></span>
                <span className="flex items-center gap-2 text-body-sm tnum">
                  {w && <span className={inside ? 'text-on-surface-variant' : 'text-warning'}>{formatInTimeZone(start, w.timezone, 'HH:mm')} {w.city ?? ''}{!inside && ` · ${t('p.mtg.outside')}`}</span>}
                  <Pill tone={p.rsvp === 'yes' ? 'healthy' : p.rsvp === 'no' ? 'alert' : 'neutral'}>{t(`p.mtg.rsvp.${p.rsvp}` as MessageKey)}</Pill>
                </span>
              </li>
            );
          })}
        </ul>
        <MeetingActions meetingId={m.id} myRsvp={mine?.rsvp ?? null} canManage={m.organizer_id === user.id || can.manage(role)} />
      </Card>
    </div>
  );
}
