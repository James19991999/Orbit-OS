'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { Avatar, Input, Select, Pill, EmptyState, Dialog } from '@/components/ui';
import { dayPhase, regionOf } from '@/lib/scheduling/time';
import { ROLE_LABEL } from '@/lib/roles';
import { relativeTime } from '@/lib/format';
import type { Role } from '@/lib/types';

export interface PersonRow { id: string; name: string; email: string | null; avatar: string | null; role: Role; title: string | null; department: string | null; timezone: string; city: string | null; workStart: string; workEnd: string;
  openTasks: number; kudos: { message: string; created_at: string }[]; streak: number }

const PHASE_LABEL = { starting: 'Starting day', working: 'Working', wrapping: 'Wrapping up', off: 'Off hours' } as const;

export function Directory({ people }: { people: PersonRow[] }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [region, setRegion] = useState('');
  const [dept, setDept] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState<PersonRow | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const depts = useMemo(() => [...new Set(people.map((p) => p.department).filter(Boolean) as string[])].sort(), [people]);
  const shown = people.filter((p) => (!q || `${p.name} ${p.email} ${p.title} ${p.city}`.toLowerCase().includes(q.toLowerCase()))
    && (!role || p.role === role) && (!region || regionOf(p.timezone) === region) && (!dept || p.department === dept));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Search" type="search" placeholder="Name, title, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: '', label: 'All roles' }, ...(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))]} />
        <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)} options={[{ value: '', label: 'All regions' }, { value: 'Americas', label: 'Americas' }, { value: 'EMEA', label: 'EMEA' }, { value: 'APAC', label: 'APAC' }]} />
        <Select label="Department" value={dept} onChange={(e) => setDept(e.target.value)} options={[{ value: '', label: 'All departments' }, ...depts.map((d) => ({ value: d, label: d }))]} />
      </div>
      {shown.length === 0 ? <EmptyState icon="person_search" title="No one matches those filters" /> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const ph = now ? dayPhase({ userId: p.id, timezone: p.timezone, workStart: p.workStart, workEnd: p.workEnd }, now) : null;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p)} className="card flex w-full items-start gap-3 p-4 text-left hover:border-outline">
                  <Avatar name={p.name} src={p.avatar} size={44} online={ph ? ph !== 'off' : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-md">{p.name}</span>
                    <span className="block truncate text-body-sm text-on-surface-variant">{p.title ?? ROLE_LABEL[p.role]}{p.department ? ` · ${p.department}` : ''}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-body-sm">
                      <span className="tnum" suppressHydrationWarning>{now ? formatInTimeZone(now, p.timezone, 'HH:mm') : '--:--'}</span>
                      <span className="text-on-surface-variant">{p.city ?? p.timezone.split('/').pop()?.replace(/_/g, ' ')}</span>
                      {ph && <Pill tone={ph === 'off' ? 'neutral' : 'healthy'}>{PHASE_LABEL[ph]}</Pill>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} description={open ? `${open.title ?? ''}${open.title ? ' · ' : ''}${ROLE_LABEL[open.role]}` : ''}>
        {open && (
          <dl className="grid gap-3 text-body-md">
            <div><dt className="text-label-xs uppercase text-on-surface-variant">Email</dt><dd>{open.email ? <a className="text-primary hover:underline" href={`mailto:${open.email}`}>{open.email}</a> : '—'}</dd></div>
            <div><dt className="text-label-xs uppercase text-on-surface-variant">Working hours</dt><dd>{open.workStart.slice(0, 5)}–{open.workEnd.slice(0, 5)} {open.timezone.replace(/_/g, ' ')}</dd></div>
            <div><dt className="text-label-xs uppercase text-on-surface-variant">Open tasks</dt><dd className="tnum">{open.openTasks}</dd></div>
            <div><dt className="text-label-xs uppercase text-on-surface-variant">Check-in streak</dt><dd className="tnum">{open.streak} day{open.streak === 1 ? '' : 's'}</dd></div>
            <div><dt className="text-label-xs uppercase text-on-surface-variant">Recent kudos</dt>
              <dd>{open.kudos.length ? <ul className="mt-1 space-y-1">{open.kudos.map((k, i) => <li key={i} className="text-body-sm">“{k.message}” <span className="text-on-surface-variant">{relativeTime(k.created_at)}</span></li>)}</ul> : '—'}</dd></div>
          </dl>
        )}
      </Dialog>
    </div>
  );
}

