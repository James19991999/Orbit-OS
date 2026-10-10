import { SLOT_MIN } from '@/lib/scheduling/overlap';

/** 24h UTC heat strip: each 15-minute cell is shaded by how many members are working. */
export function OverlapBand({ slots, total, best, dayStart, nowMs }: { slots: number[]; total: number; best: { start: number; end: number } | null; dayStart: number; nowMs: number }) {
  const nowPct = ((nowMs - dayStart) / 86_400_000) * 100;
  const bs = best ? ((best.start - dayStart) / 86_400_000) * 100 : 0;
  const bw = best ? ((best.end - best.start) / 86_400_000) * 100 : 0;
  return (
    <figure>
      <div className="relative h-10 overflow-hidden rounded border border-outline-variant bg-surface-container-lowest" role="img"
        aria-label={best ? `Overlap window ${new Date(best.start).toISOString().slice(11, 16)} to ${new Date(best.end).toISOString().slice(11, 16)} UTC` : 'No overlapping working hours today'}>
        <div className="absolute inset-0 flex">
          {slots.map((c, i) => (
            <div key={i} className="h-full flex-1" style={{ background: total ? `rgba(37,99,235,${(c / total) * 0.55})` : 'transparent' }} title={`${String(Math.floor((i * SLOT_MIN) / 60)).padStart(2, '0')}:${String((i * SLOT_MIN) % 60).padStart(2, '0')} UTC · ${c}/${total} working`} />
          ))}
        </div>
        {best && <div className="absolute inset-y-0 border-x-2 border-tertiary bg-tertiary/20" style={{ left: `${bs}%`, width: `${bw}%` }} />}
        {nowPct >= 0 && nowPct <= 100 && <div className="absolute inset-y-0 w-0.5 bg-on-surface" style={{ left: `${nowPct}%` }} aria-hidden />}
      </div>
      <div className="mt-1 flex justify-between text-body-sm text-on-surface-variant tnum" aria-hidden>
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-body-sm text-on-surface-variant">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[rgba(37,99,235,0.15)]" />Few working</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[rgba(37,99,235,0.55)]" />Most working</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-tertiary bg-tertiary/20" />Overlap window</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-on-surface" />Now</span>
      </figcaption>
    </figure>
  );
}
