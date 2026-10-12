import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
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
import { getT } from '@/i18n/server';
import { getFormat } from '@/lib/locale/server';
import type { MessageKey } from '@/i18n/shared';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.sch.title') };
}

const PHASE: Record<DayPhase, { icon: string; tone: 'healthy' | 'info' | 'warning' | 'neutral' }> = {
  starting: { icon: 'wb_twilight', tone: 'info' },
  working: { icon: 'wb_sunny', tone: 'healthy' },
  wrapping: { icon: 'partly_cloudy_day', tone: 'warning' },
  off: { icon: 'bedtime', tone: 'neutral' },
};

export default async function SchedulingPage() {
  const [{ supabase, org, profile, user, role }, t, fmt] = await Promise.all([requireAppContext(), getT(), getFormat()]);
  const now = Date.now();
  const [members, upcomingRes, pastRes] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('meetings').select('*, meeting_participants(user_id, rsvp)').eq('org_id', org.id).gte('starts_at', new Date(now - 30 * 60_000).toISOString()).order('starts_at').limit(20),
    supabase.from('meetings').select('id, starts_at, duration_min, mode, meeting_participants(meeting_id, user_id)').eq('org_id', org.id).gte('starts_at', isoDaysAgo(14)).lt('starts_at', new Date(now).toISOString()),
  ]);
  const windows = toWindows(members);
  const people = nameMap(members);
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
        <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant"><Icon name="public" className="text-[16px]" />{t('p.sch.presence', { offset: utcOffsetLabel(now, profile.timezone) })}</p>
        <h1 className="mt-1 text-headline-lg-mobile md:text-headline-lg">{t('p.sch.title')}</h1>
      </div>

      <Card>
        <CardHeader title={t('p.sch.matrix')} icon="travel_explore" subtitle={t('p.sch.people_cities', { people: t('p.sch.n_people', { count: members.length }), cities: t('p.sch.n_cities', { count: hubs.length }) })} />
        <div className="mb-4 flex flex-wrap gap-4 text-body-md">
          {(['Americas', 'EMEA', 'APAC'] as const).map((r) => (
            <span key={r} className="flex items-center gap-2"><span className="text-on-surface-variant">{t(`p.sch.region.${r}` as MessageKey)}</span><strong className="tnum">{members.length ? Math.round(((regions[r] ?? 0) / members.length) * 100) : 0}%</strong></span>
          ))}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {hubs.map((h) => {
            const phase = dayPhase(h.members[0], now); const ph = { ...PHASE[phase], label: t(`p.sch.ph.${phase}` as MessageKey) };
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
        <Card glow className="xl:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-headline-sm"><Icon name="timelapse" className="text-secondary" />{t('p.sch.overlap')}</h2>
            {overlap.best && <Pill tone={overlap.meetsTarget ? 'healthy' : 'warning'} pulse={!!inWindow}>{t('p.sch.overlap_pct', { pct: overlap.coveragePct })}{inWindow ? ` · ${t('p.sch.active')}` : ''}</Pill>}
          </div>
          {overlap.best ? (
            <>
              <p className="text-label-xs uppercase text-on-surface-variant">{t('p.sch.today_utc')}</p>
              <p className="mt-1 text-headline-lg tnum">{fmtUtcTime(overlap.best.start)} – {fmtUtcTime(overlap.best.end)}</p>
              <p className="mt-1 text-body-md text-on-surface-variant">
                {t('p.sch.working_now', { n: overlap.best.count, total: overlap.total, hours: overlap.hours.toFixed(1) })}
                {inWindow && <> · {t('p.sch.remaining')} <Countdown until={overlap.best.end} initialMin={Math.round((overlap.best.end - now) / 60_000)} /></>}
                {!overlap.meetsTarget && <> · <span className="text-warning">{t('p.sch.below_target', { n: Number(org.golden_overlap_min_hours) })}</span></>}
              </p>
              <div className="mt-4"><OverlapBand t={t} slots={overlap.slots} total={overlap.total} best={overlap.best} dayStart={overlap.dayStart} nowMs={now} /></div>
            </>
          ) : <EmptyState icon="event_busy" title={t('p.sch.no_overlap')} body={t('p.sch.no_overlap_body')} />}
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title={t('p.sch.suggest')} icon="psychology" subtitle={t('p.sch.suggest_sub')} />
          <SlotFinder members={windows} viewerTz={profile.timezone} orgId={org.id} orgSlug={org.slug} userId={user.id} canWrite={can.write(role)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
        <Card className="xl:col-span-5">
          <CardHeader title={t('p.sch.load')} icon="monitoring" subtitle={t('p.sch.last14')} />
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t('p.sch.meeting_load')} value={`${load.meetingHoursPerWeek.toFixed(1)} h`} sub={t('p.sch.per_week')} />
            <Stat label={t('p.sch.async')} value={`${Math.round(load.asyncShare * 100)}%`} sub={t('p.sch.of_meetings')} />
            <Stat label={t('p.sch.deep')} value={`${load.deepWorkHoursPerWeek.toFixed(1)} h`} sub={t('p.sch.protected')} />
          </div>
        </Card>
        <Card className="xl:col-span-7">
          <CardHeader title={t('p.sch.upcoming')} icon="event_upcoming" subtitle={t('p.sch.scheduled', { n: upcoming.length })} />
          {upcoming.length === 0 ? <EmptyState icon="event_available" title={t('p.sch.none')} /> : (
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
                        <p className="text-body-sm text-on-surface-variant tnum">{t('p.sch.your_time', { when: fmt.slot(m.starts_at, profile.timezone), n: m.duration_min, utc: formatInTimeZone(m.starts_at, 'UTC', 'HH:mm') })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.mode === 'async_first' && <Pill tone="info">{t('p.sch.async_first')}</Pill>}
                        {live && <Pill tone="healthy" pulse>{t('p.sch.live')}</Pill>}
                        {m.video_url && <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded border border-outline-variant px-3 text-label-sm hover:bg-on-surface/5"><Icon name="videocam" className="text-[16px]" />{t('p.sch.join')}</a>}
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
          <p className="mt-3 flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="mail" className="text-[16px]" />{t('p.sch.invites_note')}</p>
        </Card>
      </div>
    </div>
  );
}
