'use client';
import { useFormat } from '@/lib/locale/client';

/**
 * "3 minutes ago" as a <time> element. The text can legitimately change between the server render
 * and hydration (a minute ticks over), so only this element opts out of the hydration text check.
 * Hovering shows the exact date and time in the viewer's region and time zone.
 */
export function TimeAgo({ date, className }: { date: string | number | Date; className?: string }) {
  const fmt = useFormat();
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} title={fmt.date(d, 'datetime')} className={className} suppressHydrationWarning>
      {fmt.relative(d)}
    </time>
  );
}
