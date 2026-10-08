import type { Metadata } from 'next';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { requireAppContext } from '@/lib/context';
import { loadMembers, toWindows, nameMap, isoDaysAgo, must } from '@/lib/data/members';
import { goldenOverlap, utcMidnight } from '@/lib/scheduling/overlap';
import { dayPhase, regionOf, utcOffsetLabel, zoneAbbrev, type DayPhase } from '@/lib/scheduling/time';
import { cognitiveLoad, type MeetingLike, type ParticipantLike } from '@/lib/metrics/people';
import { fmtUtcTime } from '@/lib/time-of-day';
import { can } from '@/lib/roles';
import { Card, CardHeader, Icon, Pill, EmptyState, AvatarStack, Stat } from '@/components/ui';
import { OverlapBand } from '@/components/scheduling/OverlapBand';
import { LiveClock, Countdown } from '@/components/scheduling/LiveClock';
import { SlotFinder } from '@/components/scheduling/SlotFinder';
import type { Meeting } from '@/lib/types';

export const metadata: Metadata = { title: 'Scheduling' };

const PHASE: Record<DayPhase, { label: string; icon: string; tone: 'healthy' | 'info' | 'warning' | 'neutral' }> = {
  starting: { label: 'Starting day', icon: 'wb_twilight', tone: 'info' },
  working: { label: 'Focus hours', icon: 'wb_sunny', tone: 'healthy' },
  wrapping: { label: 'Wrapping up', icon: 'partly_cloudy_day', tone: 'warning' },
  off: { label: 'Off hours (DND)', icon: 'bedtime', tone: 'neutral' },
};

export default async function SchedulingPage() {
  const { supabase, org, profile, user, role } = await requireAppContext();
  const now = Date.now();
  const members = await loadMembers(supabase, org.id);
  const windows = toWindows(members);
  const people = nameMap(members);
  const [upcomingRes, pastRes] = await Promise.all([
    supabase.from('meetings').select('*, meeting_participants(user_id, rsvp)').eq('org_id', org.id).gte('starts_at', new Date(now - 30 * 60_000).toISOString()).order('starts_at').limit(20),
    supabase.from('meetings').select('id, starts_at, duration_min, mode, meeting_participants(meeting_id, user_id)').eq('org_id', org.id).gte('starts_at', isoDaysAgo(14)).lt('starts_at', new Date(now).toISOString()),
  ]);
  const upcoming = must(upcomingRes, 'meetings') as (Meeting & { meeting_participants: { user_id: string; rsvp: string }[] })[];
  const past = must(pastRes, 'meeting history') as (MeetingLike & { meeting_participants: ParticipantLike[] })[];
  const load = cognitiveLoad(past, past.flatMap((m) => m.meeting_participants), windows, 14);
  const overlap = goldenOverlap(windows, utcMidnight(now), Number(org.golden_overlap_min_hours));
  const inWindow = overlap.best && now >= overlap.best.start && now < overlap.best.end;

  // hubs: group members by time zone
  const hubs = Object.values(windows.reduce<Record<string, { tz: string; city: string; members: typeof windows }>>((acc, w) => {
    acc[w.timezone] ??= { tz: w.timezone, city: w.city || w.timezone.split('/').pop()!.replace(/_/g, ' '), members: [] };
    acc[w.timezone].members.push(w);
    return acc;
  }, {})).sort((a, b) => b.members.length - a.members.length || a.city.localeCompare(b.city));
  const regions = windows.reduce<Record<string, number>>((a, w) => { const r = regionOf(w.timezone); a[r] = (a[r] ?? 0) + 1; return a; }, {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant"><Icon name="public" className="text-[16px]" />Global presence · {utcOffsetLabel(now, profile.timezone)} (you)</p>
        <h1 className="mt-1 text-headline-lg-mobile md:text-headline-lg">Scheduling</h1>
      </div>

      <Card>
        <CardHeader title="Active team matrix" icon="travel_explore" subtitle={`${hubs.length} hubs · ${members.length} distributed members`} />
        <div className="mb-4 flex flex-wrap gap-4 text-body-md">
          {(['Americas', 'EMEA', 'APAC'] as const).map((r) => (
            <span key={r} className="flex items-center gap-2"><span className="text-on-surface-variant">{r}</span><strong className="tnum">{members.length ? Math.round(((regions[r] ?? 0) / members.length) * 100) : 0}%</strong></span>
          ))}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {hubs.slice(0, 8).map((h) => {
            const ph = PHASE[dayPhase(h.members[0], now)];
            return (
              <li key={h.tz} className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <div className="flex items-center justify-between">
                  <p className="text-label-md">{h.city}</p>
                  <Icon name={ph.icon} className="text-secondary" label={ph.label} />
                </div>
                <p className="mt-2 text-headline-md"><LiveClock timezone={h.tz} initial={formatInTimeZone(now, h.tz, 'HH:mm')} /> <span className="text-body-sm text-on-surface-variant">{zoneAbbrev(now, h.tz)}</span></p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Pill tone={ph.tone}>{ph.label}</Pill>
                  <AvatarStack people={h.members.map((m) => ({ name: m.name ?? '', src: people[m.userId]?.avatar }))} size={22} max={3} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <Card glow className="xl:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-headline-sm"><Icon name="timelapse" className="text-secondary" />Golden overlap band</h2>
            {overlap.best && <Pill tone={overlap.meetsTarget ? 'healthy' : 'warning'} pulse={!!inWindow}>{overlap.coveragePct}% overlap{inWindow ? ' · active' : ''}</Pill>}
          </div>
          {overlap.best ? (
            <>
              <p className="text-label-xs uppercase text-on-surface-variant">Synchronous golden window (today, UTC)</p>
              <p className="mt-1 text-headline-lg tnum">{fmtUtcTime(overlap.best.start)} – {fmtUtcTime(overlap.best.end)}</p>
              <p className="mt-1 text-body-md text-on-surface-variant">
                {overlap.best.count} of {overlap.total} members working · {overlap.hours.toFixed(1)} h
                {inWindow && <> · Remaining <Countdown until={overlap.best.end} initialMin={Math.round((overlap.best.end - now) / 60_000)} /></>}
                {!overlap.meetsTarget && <> · <span className="text-warning">below your {Number(org.golden_overlap_min_hours)} h target</span></>}
              </p>
              <div className="mt-4"><OverlapBand slots={overlap.slots} total={overlap.total} best={overlap.best} dayStart={overlap.dayStart} nowMs={now} /></div>
            </>
          ) : <EmptyState icon="event_busy" title="No shared working hours today" body="It may be a weekend for most of the team, or working hours don't overlap." />}
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title="Orchestration suggestion" icon="psychology" subtitle="Best upcoming slot for a group — computed from everyone's working hours" />
          <SlotFinder members={windows} viewerTz={profile.timezone} orgId={org.id} orgSlug={org.slug} userId={user.id} canWrite={can.write(role)} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <Card className="xl:col-span-5">
          <CardHeader title="Cognitive load & async shift" icon="monitoring" subtitle="Last 14 days" />
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Meeting load" value={`${load.meetingHoursPerWeek.toFixed(1)} h`} sub="per person / week" />
            <Stat label="Async-first" value={`${Math.round(load.asyncShare * 100)}%`} sub="of meetings" />
            <Stat label="Deep work" value={`${load.deepWorkHoursPerWeek.toFixed(1)} h`} sub="protected / week" />
          </div>
        </Card>
        <Card className="xl:col-span-7">
          <CardHeader title="Upcoming syncs" icon="event_upcoming" subtitle={`${upcoming.length} scheduled`} />
          {upcoming.length === 0 ? <EmptyState icon="event_available" title="No upcoming meetings" /> : (
            <ul className="divide-y divide-outline-variant">
              {upcoming.map((m) => {
                const parts = m.meeting_participants.map((p) => windows.find((w) => w.userId === p.user_id)).filter(Boolean) as typeof windows;
                const zones = [...new Map(parts.map((p) => [p.timezone, p])).values()].slice(0, 4);
                const live = now >= new Date(m.starts_at).getTime() && now < new Date(m.starts_at).getTime() + m.duration_min * 60_000;
                return (
                  <li key={m.id} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-label-md"><Link href={`/scheduling/meetings/${m.id}`} className="hover:underline">{m.title}</Link></h3>
                        <p className="text-body-sm text-on-surface-variant tnum">{formatInTimeZone(m.starts_at, profile.timezone, 'EEE d MMM · HH:mm')} your time · {m.duration_min} min · {formatInTimeZone(m.starts_at, 'UTC', 'HH:mm')} UTC</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.mode === 'async_first' && <Pill tone="info">Async-first</Pill>}
                        {live && <Pill tone="healthy" pulse>Live</Pill>}
                        {m.video_url && <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded border border-outline-variant px-3 text-label-sm hover:bg-on-surface/5"><Icon name="videocam" className="text-[16px]" />Join</a>}
                      </div>
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-body-sm text-on-surface-variant tnum">
                      {zones.map((z) => <span key={z.timezone}>{formatInTimeZone(m.starts_at, z.timezone, 'HH:mm')} {z.city ?? z.timezone.split('/').pop()}</span>)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="mail" className="text-[16px]" />Invites are emailed as calendar files (.ics) that work with Google Calendar and Outlook.</p>
        </Card>
      </div>
    </div>
  );
}
