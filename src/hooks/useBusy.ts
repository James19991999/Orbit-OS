'use client';
import { useEffect, useState } from 'react';
import type { BusyMap } from '@/lib/scheduling/slots';

/** Teammates' busy times from their connected calendars (times only). Empty until loaded, or if none are connected. */
export function useBusy(userIds: string[]) {
  const key = [...userIds].sort().join(',');
  const [state, setState] = useState<{ busy: BusyMap; connected: string[] }>({ busy: {}, connected: [] });
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/calendar/busy?users=${key}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j) setState({ busy: j.busy ?? {}, connected: j.connected ?? [] }); })
        .catch(() => undefined);   // no calendars → plain working-hours suggestions
    }, 300);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [key]);
  return state;
}
