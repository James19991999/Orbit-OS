import type { Metadata } from 'next';
import Link from 'next/link';
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

export const metadata: Metadata = { title: 'Meeting' };

export default async function MeetingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase, org, profile, user, role } = await requireAppContext();
  const { data } = await supabase.from('meetings').select('*, meeting_participants(user_id, rsvp)').eq('id', params.id).eq('org_id', org.id).maybeSingle();
  if (!data) notFound();
  const m = data as Meeting & { meeting_participants: { user_id: string; rsvp: 'pending' | 'yes' | 'no' | 'maybe' }[] };
  const members = await loadMembers(supabase, org.id);
  const windows = toWindows(members);
  const start = new Date(m.starts_at).getTime();
  const mine = m.meeting_participants.find((p) => p.user_id === user.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/scheduling" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />Scheduling</Link>
      <Card>
        <div className="flex flex-wrap gap-2">{m.mode === 'async_first' ? <Pill tone="info">Async-first</Pill> : <Pill tone="neutral">Live sync</Pill>}</div>
        <h1 className="mt-2 text-headline-lg-mobile md:text-headline-lg">{m.title}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant tnum">{formatInTimeZone(start, profile.timezone, "EEEE d MMMM yyyy · HH:mm")} your time · {m.duration_min} min</p>
        {m.description && <p className="mt-3 whitespace-pre-wrap text-body-lg">{m.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {m.video_url && <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded bg-primary-container px-4 text-label-md text-white"><Icon name="videocam" className="text-[18px]" />Join video call</a>}
          {m.loom_url && <a href={m.loom_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant px-4 text-label-md"><Icon name="play_circle" className="text-[18px]" />Async recording</a>}
          <a href={`/api/meetings/${m.id}/ics`} className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant px-4 text-label-md"><Icon name="download" className="text-[18px]" />Download .ics</a>
          <a href={googleCalendarUrl({ title: m.title, description: m.description, start: new Date(start), durationMin: m.duration_min, url: m.video_url })} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant px-4 text-label-md"><Icon name="calendar_add_on" className="text-[18px]" />Add to Google Calendar</a>
        </div>
        <h2 className="mt-6 text-headline-sm">Participants</h2>
        <ul className="mt-2 divide-y divide-outline-variant">
          {m.meeting_participants.map((p) => {
            const w = windows.find((x) => x.userId === p.user_id);
            const inside = w ? isWithinWorkingHours(w, start, start + m.duration_min * 60_000) : true;
            return (
              <li key={p.user_id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2"><Avatar name={w?.name ?? 'Member'} size={28} /><span>{w?.name ?? 'Former member'}{p.user_id === m.organizer_id && <span className="text-on-surface-variant"> · organizer</span>}</span></span>
                <span className="flex items-center gap-2 text-body-sm tnum">
                  {w && <span className={inside ? 'text-on-surface-variant' : 'text-warning'}>{formatInTimeZone(start, w.timezone, 'HH:mm')} {w.city ?? ''}{!inside && ' · outside hours'}</span>}
                  <Pill tone={p.rsvp === 'yes' ? 'healthy' : p.rsvp === 'no' ? 'alert' : 'neutral'}>{p.rsvp}</Pill>
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
