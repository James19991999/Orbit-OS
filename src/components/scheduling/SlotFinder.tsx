'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { Button, Icon, Pill, Select, EmptyState } from '@/components/ui';
import { suggestSlots } from '@/lib/scheduling/slots';
import type { MemberWindow } from '@/lib/scheduling/time';
import { MeetingDialog } from './MeetingDialog';

/** Deterministic "orchestration suggestion": best upcoming slots for a chosen group (no AI involved). */
export function SlotFinder({ members, viewerTz, orgId, orgSlug, userId, canWrite }:
  { members: MemberWindow[]; viewerTz: string; orgId: string; orgSlug: string; userId: string; canWrite: boolean }) {
  const sp = useSearchParams();
  const [ids, setIds] = useState<Set<string>>(() => new Set(members.slice(0, 9).map((m) => m.userId)));
  const [duration, setDuration] = useState(45);
  const [dialog, setDialog] = useState<null | { start?: number; ids?: string[] }>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  useEffect(() => { if (sp.get('new') === '1' && canWrite) setDialog({ ids: [userId] }); }, [sp, canWrite, userId]);
  const chosen = useMemo(() => members.filter((m) => ids.has(m.userId)), [members, ids]);
  const slots = useMemo(() => (now ? suggestSlots(chosen, duration, now + 30 * 60_000, { days: 5, limit: 3 }) : []), [chosen, duration, now]);
  const best = slots[0];
  const toggle = (id: string) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Duration" value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))} options={[30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }))} />
        <details className="relative">
          <summary className="flex h-11 cursor-pointer items-center gap-2 rounded border border-outline-variant bg-surface-container-high px-3 text-label-md md:h-10">
            <Icon name="group" className="text-[18px]" />{chosen.length} participants
          </summary>
          <div className="absolute right-0 z-20 mt-1 max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto sm:left-0 sm:right-auto rounded-lg border border-outline-variant bg-surface-container-high p-2 shadow-l2">
            {members.map((m) => (
              <label key={m.userId} className="flex items-center gap-2 rounded px-2 py-1.5 text-body-md hover:bg-on-surface/5">
                <input type="checkbox" checked={ids.has(m.userId)} onChange={() => toggle(m.userId)} className="h-4 w-4 accent-[#2563eb]" />
                <span className="flex-1 truncate">{m.name}</span><span className="text-body-sm text-on-surface-variant">{m.city ?? ''}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      {!now ? <p className="text-body-sm text-on-surface-variant">Calculating…</p> : !best ? (
        <EmptyState icon="event_busy" title="No shared working time in the next 5 days" body="Try fewer participants or an async-first meeting." />
      ) : (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-label-md"><Icon name="event" className="text-secondary" />{formatInTimeZone(best.start, viewerTz, 'EEE d MMM · HH:mm')} <span className="text-on-surface-variant">your time</span></p>
            <Pill tone={best.zeroOvertime ? 'healthy' : 'warning'}>{best.fitPct}% fit</Pill>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant tnum">{formatInTimeZone(best.start, 'UTC', 'HH:mm')} UTC · {duration} min</p>
          <p className="mt-2 text-body-md">
            {best.zeroOvertime ? <><strong className="text-healthy">Zero overtime impact.</strong> Inside working hours for all {chosen.length} participants.</>
              : <>Outside working hours for {best.outside.map((id) => members.find((m) => m.userId === id)?.name).join(', ')}.</>}
          </p>
          {slots.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-body-sm">
              {slots.slice(1).map((s) => (
                <li key={s.start}><button type="button" disabled={!canWrite} onClick={() => setDialog({ start: s.start, ids: [...ids] })}
                  className="rounded-full border border-outline-variant px-3 py-1 hover:bg-on-surface/5">{formatInTimeZone(s.start, viewerTz, 'EEE HH:mm')} · {s.fitPct}%</button></li>
              ))}
            </ul>
          )}
          {canWrite && <Button className="mt-4" icon="bolt" onClick={() => setDialog({ start: best.start, ids: [...ids] })}>Schedule overlap sync</Button>}
        </div>
      )}
      <MeetingDialog open={dialog !== null} onClose={() => setDialog(null)} orgId={orgId} orgSlug={orgSlug} userId={userId} viewerTz={viewerTz} members={members}
        preset={{ start: dialog?.start, participantIds: dialog?.ids, durationMin: duration }} />
    </div>
  );
}
