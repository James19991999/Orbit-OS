'use client';
import { useEffect, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

/** Renders a zone's local time, refreshing every 30s. Server renders the initial value (no hydration jump). */
export function LiveClock({ timezone, format = 'HH:mm', initial }: { timezone: string; format?: string; initial: string }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const t = setInterval(() => setV(formatInTimeZone(new Date(), timezone, format)), 30_000);
    return () => clearInterval(t);
  }, [timezone, format]);
  return <time className="tnum" suppressHydrationWarning>{v}</time>;
}

export function Countdown({ until, initialMin }: { until: number; initialMin: number }) {
  const [m, setM] = useState(initialMin);
  useEffect(() => {
    const t = setInterval(() => setM(Math.max(0, Math.round((until - Date.now()) / 60_000))), 30_000);
    return () => clearInterval(t);
  }, [until]);
  const h = Math.floor(m / 60);
  return <span className="tnum">{h ? `${h}h ` : ''}{m % 60}m</span>;
}
