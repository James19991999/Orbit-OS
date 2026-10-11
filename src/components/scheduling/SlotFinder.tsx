'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { Button, Icon, Pill, Select, EmptyState } from '@/components/ui';
import { suggestSlots } from '@/lib/scheduling/slots';
import type { MemberWindow } from '@/lib/scheduling/time';
import { useBusy } from '@/hooks/useBusy';
import { useT } from '@/i18n/client';
import { useFormat } from '@/lib/locale/client';
import { MeetingDialog } from './MeetingDialog';

/** Deterministic "orchestration suggestion": best upcoming slots for a chosen group (no AI involved). */
export function SlotFinder({ members, viewerTz, orgId, orgSlug, userId, canWrite }:
  { members: MemberWindow[]; viewerTz: string; orgId: string; orgSlug: string; userId: string; canWrite: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const sp = useSearchParams();
  const [ids, setIds] = useState<Set<string>>(() => new Set(members.slice(0, 9).map((m) => m.userId)));
  const [duration, setDuration] = useState(45);
  const [dialog, setDialog] = useState<null | { start?: number; ids?: string[] }>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  useEffect(() => { if (sp.get('new') === '1' && canWrite) setDialog({ ids: [userId] }); }, [sp, canWrite, userId]);
  const chosen = useMemo(() => members.filter((m) => ids.has(m.userId)), [members, ids]);
  const { busy, connected } = useBusy(chosen.map((m) => m.userId));
  const slots = useMemo(() => (now ? suggestSlots(chosen, duration, now + 30 * 60_000, { days: 5, limit: 3, busy }) : []), [chosen, duration, now, busy]);
  const best = slots[0];
  const toggle = (id: string) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const names = (list: string[]) => list.map((id) => members.find((m) => m.userId === id)?.name).filter(Boolean).join(', ');
  const checked = chosen.filter((m) => connected.includes(m.userId)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select label={t('slot.duration')} value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))} options={[30, 45, 60, 90].map((m) => ({ value: String(m), label: t('slot.min', { n: m }) }))} />
        <details className="relative">
          <summary className="flex h-11 cursor-pointer items-center gap-2 rounded border border-outline-variant bg-surface-container-high px-3 text-label-md md:h-10">
            <Icon name="group" className="text-[18px]" />{t('slot.participants', { count: chosen.length })}
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
      {!now ? <p className="text-body-sm text-on-surface-variant">{t('slot.calculating')}</p> : !best ? (
        <EmptyState icon="event_busy" title={t('slot.none_title')} body={t('slot.none_body')} />
      ) : (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-label-md"><Icon name="event" className="text-secondary" />{fmt.slot(best.start, viewerTz)} <span className="text-on-surface-variant">{t('slot.your_time')}</span></p>
            <Pill tone={best.allFree ? 'healthy' : 'warning'}>{t('slot.fit', { pct: best.fitPct })}</Pill>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant tnum">{formatInTimeZone(best.start, 'UTC', 'HH:mm')} UTC · {t('slot.min', { n: duration })}</p>
          <p className="mt-2 text-body-md" data-testid="slot-verdict">
            {best.allFree && checked > 0 ? <><strong className="text-healthy">{t('slot.all_free')}</strong> {t('slot.all_free_body', { count: chosen.length })}</>
              : best.allFree ? <><strong className="text-healthy">{t('slot.zero_overtime')}</strong> {t('slot.zero_overtime_body', { count: chosen.length })}</>
              : <>{best.outside.length > 0 && t('slot.outside', { names: names(best.outside) })} {best.busy.length > 0 && t('slot.busy', { names: names(best.busy) })}</>}
          </p>
          {checked > 0 && <p className="mt-1 flex items-center gap-1 text-body-sm text-on-surface-variant"><Icon name="calendar_month" className="text-[16px]" />{t('slot.calendars', { n: checked, total: chosen.length })}</p>}
          {slots.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-body-sm">
              {slots.slice(1).map((s) => (
                <li key={s.start}><button type="button" disabled={!canWrite} onClick={() => setDialog({ start: s.start, ids: [...ids] })}
                  className="rounded-full border border-outline-variant px-3 py-1 hover:bg-on-surface/5">{fmt.slot(s.start, viewerTz, false)} · {s.fitPct}%</button></li>
              ))}
            </ul>
          )}
          {canWrite && <Button className="mt-4" icon="bolt" onClick={() => setDialog({ start: best.start, ids: [...ids] })}>{t('slot.schedule')}</Button>}
        </div>
      )}
      <MeetingDialog open={dialog !== null} onClose={() => setDialog(null)} orgId={orgId} orgSlug={orgSlug} userId={userId} viewerTz={viewerTz} members={members}
        preset={{ start: dialog?.start, participantIds: dialog?.ids, durationMin: duration }} />
    </div>
  );
}
