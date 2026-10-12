import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { fromZonedTime } from 'date-fns-tz';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap } from '@/lib/data/members';
import { can } from '@/lib/roles';
import { Avatar, Card, CardHeader, Icon, LinkButton, Pill } from '@/components/ui';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/shared';
import { getFormat } from '@/lib/locale/server';
import { firstName } from '@/lib/format';
import { greetingKey } from '@/lib/time-of-day';
import { localDateOf } from '@/lib/scheduling/time';
import { PRIORITY_TONE } from '@/lib/tasks';
import { localizeNotification } from '@/lib/notification-text';
import type { Task } from '@/lib/types';
import type { AwayRow, LeaveRequest } from '@/lib/leave';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('md.title') };
}

interface MeetingRow { id: string; title: string; starts_at: string; duration_min: number; video_url: string | null }

/** Everything that's mine today on one screen: tasks, meetings, check-in, approvals, mentions, who's away. */
export default async function MyDayPage() {
  const [t, fmt, ctx] = await Promise.all([getT(), getFormat(), requireAppContext()]);
  const { supabase, org, role, user, profile } = ctx;
  const tz = profile.timezone || 'UTC';
  const now = new Date();
  const localToday = localDateOf(now.getTime(), tz);
  const utcToday = now.toISOString().slice(0, 10);
  const dayStart = fromZonedTime(`${localToday}T00:00:00`, tz).toISOString();
  const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
  const manager = can.manage(role);

  const [members, tasksR, organizedR, joinedR, checkinR, expensesR, leaveR, mentionsR, awayR, myLeaveR] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('tasks').select('*').eq('org_id', org.id).eq('assignee_id', user.id).neq('status', 'done').order('due_on', { ascending: true, nullsFirst: false }).limit(60),
    supabase.from('meetings').select('id, title, starts_at, duration_min, video_url').eq('org_id', org.id).eq('organizer_id', user.id).gte('starts_at', dayStart).lt('starts_at', dayEnd),
    supabase.from('meeting_participants').select('meeting:meetings!inner(id, title, starts_at, duration_min, video_url)').eq('org_id', org.id).eq('user_id', user.id).neq('rsvp', 'no')
      .gte('meeting.starts_at', dayStart).lt('meeting.starts_at', dayEnd),
    supabase.from('check_ins').select('id').eq('org_id', org.id).eq('user_id', user.id).eq('for_date', utcToday).maybeSingle(),
    manager ? supabase.from('finance_entries').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('approval_status', 'pending').neq('created_by', user.id) : Promise.resolve({ count: 0 }),
    manager ? supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'pending').neq('user_id', user.id) : Promise.resolve({ count: 0 }),
    supabase.from('notifications').select('id, kind, title, body, link, created_at').eq('user_id', user.id).eq('org_id', org.id).eq('kind', 'mention').is('read_at', null).order('created_at', { ascending: false }).limit(5),
    supabase.rpc('team_away', { p_org: org.id, p_from: localToday, p_to: localToday }),
    supabase.from('leave_requests').select('*').eq('org_id', org.id).eq('user_id', user.id).in('status', ['pending', 'approved']).gte('ends_on', localToday).order('starts_on').limit(1),
  ]);
  const people = nameMap(members);
  const tasks = (tasksR.data ?? []) as Task[];
  const overdue = tasks.filter((x) => x.due_on && x.due_on < localToday);
  const dueToday = tasks.filter((x) => x.due_on === localToday);
  const doing = tasks.filter((x) => !overdue.includes(x) && !dueToday.includes(x) && ['in_progress', 'in_review', 'blocked'].includes(x.status));
  const next = tasks.filter((x) => !overdue.includes(x) && !dueToday.includes(x) && !doing.includes(x)).slice(0, 6);
  const meetings = [
    ...((organizedR.data ?? []) as MeetingRow[]),
    ...((joinedR.data ?? []) as unknown as { meeting: MeetingRow }[]).map((r) => r.meeting),
  ].filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const checkedIn = !!checkinR.data;
  const expenses = expensesR.count ?? 0;
  const leaveWaiting = leaveR.count ?? 0;
  const mentions = (mentionsR.data ?? []) as { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string }[];
  const away = ((awayR.data ?? []) as AwayRow[]).filter((a) => a.user_id !== user.id);
  const myLeave = ((myLeaveR.data ?? []) as LeaveRequest[])[0];

  const group = (label: string, list: Task[], tone?: 'alert' | 'warning') => list.length > 0 && (
    <div>
      <h3 className={`mb-1 text-label-xs uppercase ${tone === 'alert' ? 'text-alert' : tone === 'warning' ? 'text-warning' : 'text-on-surface-variant'}`}>{label} · {list.length}</h3>
      <ul className="divide-y divide-outline-variant">
        {list.map((x) => (
          <li key={x.id}>
            <Link href={`/operations/tasks/${x.id}`} className="flex items-center gap-3 rounded px-1 py-2 hover:bg-on-surface/5">
              <Pill tone={PRIORITY_TONE[x.priority]}>{t(`task.pr.${x.priority}` as MessageKey)}</Pill>
              <span className="min-w-0 flex-1 truncate text-body-md">{x.title}</span>
              {x.due_on && <span className="text-body-sm text-on-surface-variant tnum">{fmt.date(x.due_on)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t(greetingKey(tz, now))}, {firstName(profile.full_name)}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('md.title')} · {fmt.date(now, 'long')}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <div className="flex flex-col gap-4 xl:col-span-7">
          <Card aria-labelledby="md-tasks-h">
            <CardHeader title={<span id="md-tasks-h">{t('md.tasks')}</span>} icon="task_alt" action={<Link href="/operations" className="text-label-md text-primary hover:underline">{t('md.view_all')}</Link>} />
            {tasks.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('md.tasks_empty')}</p> : (
              <div className="flex flex-col gap-4">
                {group(t('md.overdue'), overdue, 'alert')}
                {group(t('md.today'), dueToday, 'warning')}
                {group(t('md.doing'), doing)}
                {group(t('md.next'), next)}
              </div>
            )}
          </Card>

          <Card aria-labelledby="md-meet-h">
            <CardHeader title={<span id="md-meet-h">{t('md.meetings')}</span>} icon="event" />
            {meetings.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('md.meetings_empty')}</p> : (
              <ul className="divide-y divide-outline-variant">
                {meetings.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="w-28 text-body-sm text-on-surface-variant tnum">{fmt.slot(m.starts_at, undefined, false)} · {m.duration_min}′</span>
                    <Link href={`/scheduling/meetings/${m.id}`} className="min-w-0 flex-1 truncate text-body-md hover:underline">{m.title}</Link>
                    {m.video_url && <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded border border-outline-variant px-3 text-label-sm hover:bg-on-surface/5"><Icon name="videocam" className="text-[16px]" />{t('md.join')}</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-5">
          {can.write(role) && (
            <Card aria-labelledby="md-ci-h">
              <CardHeader title={<span id="md-ci-h">{t('md.checkin')}</span>} icon="edit_note" />
              {checkedIn
                ? <p className="flex items-center gap-2 text-body-md text-healthy"><Icon name="check_circle" filled />{t('md.checkin_done')}</p>
                : <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-body-md">{t('md.checkin_todo')}</p><LinkButton href="/culture" size="sm" icon="edit_note">{t('md.checkin_go')}</LinkButton></div>}
            </Card>
          )}

          {manager && (
            <Card aria-labelledby="md-wait-h">
              <CardHeader title={<span id="md-wait-h">{t('md.waiting')}</span>} icon="pending_actions" />
              {expenses + leaveWaiting === 0 ? <p className="text-body-md text-on-surface-variant">{t('md.waiting_empty')}</p> : (
                <ul className="flex flex-col gap-2">
                  {expenses > 0 && <li><Link href="/operations?tab=finance" className="flex items-center justify-between rounded border border-outline-variant px-3 py-2 hover:bg-on-surface/5"><span className="text-body-md">{t('md.expenses')}</span><Pill tone="warning">{expenses}</Pill></Link></li>}
                  {leaveWaiting > 0 && <li><Link href="/people?tab=leave" className="flex items-center justify-between rounded border border-outline-variant px-3 py-2 hover:bg-on-surface/5"><span className="text-body-md">{t('md.leave')}</span><Pill tone="warning">{leaveWaiting}</Pill></Link></li>}
                </ul>
              )}
            </Card>
          )}

          <Card aria-labelledby="md-men-h">
            <CardHeader title={<span id="md-men-h">{t('md.mentions')}</span>} icon="alternate_email" />
            {mentions.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('md.mentions_empty')}</p> : (
              <ul className="flex flex-col gap-2">
                {mentions.map((n) => {
                  const l = localizeNotification(n, t);
                  return (
                    <li key={n.id}>
                      <Link href={n.link ?? '/notifications'} className="block rounded border border-outline-variant px-3 py-2 hover:bg-on-surface/5">
                        <span className="block text-label-md">{l.title}</span>
                        {l.body && <span className="mt-0.5 block truncate text-body-sm text-on-surface-variant">{l.body}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card aria-labelledby="md-away-h">
            <CardHeader title={<span id="md-away-h">{t('md.away')}</span>} icon="flight_takeoff" action={<Link href="/people?tab=leave" className="text-label-md text-primary hover:underline">{t('md.view_all')}</Link>} />
            {away.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('md.away_empty')}</p> : (
              <ul className="flex flex-wrap gap-3">
                {away.map((a) => (
                  <li key={a.user_id} className="flex items-center gap-2"><Avatar name={people[a.user_id]?.name ?? '—'} src={people[a.user_id]?.avatar} size={28} /><span className="text-body-md">{people[a.user_id]?.name ?? '—'}</span></li>
                ))}
              </ul>
            )}
            {myLeave && (
              <p className="mt-3 border-t border-outline-variant pt-3 text-body-sm text-on-surface-variant">
                {t('md.my_leave')}: <span className="text-on-surface tnum">{myLeave.starts_on === myLeave.ends_on ? fmt.date(myLeave.starts_on) : `${fmt.date(myLeave.starts_on)} – ${fmt.date(myLeave.ends_on)}`}</span> · {t(`lv.st.${myLeave.status}` as MessageKey)}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
