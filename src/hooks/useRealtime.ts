'use client';
import { useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { useDataSaver } from '@/components/shell/DataSaver';

export type LiveStatus = 'connecting' | 'live' | 'paused';

/**
 * Subscribes to postgres_changes for a table (optionally filtered). Never fails silently:
 * channel errors/timeouts flip status to 'paused' so the UI can show a retry banner.
 */
export function useRealtime(
  key: string,
  table: string,
  filter: string | undefined,
  onChange: (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void,
) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [attempt, setAttempt] = useState(0);
  const saver = useDataSaver();
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = getBrowserClient();
    // Data saver: stay paused until the person taps Retry (attempt > 0) on this screen.
    if (!supabase || (saver && attempt === 0)) { setStatus('paused'); return; }
    setStatus('connecting');
    // Connect once the page is idle: live updates can wait a moment; the first paint and taps can't.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const connect = () => {
      channel = supabase
        .channel(`${key}:${attempt}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (payload) => {
          try {
            cb.current(payload as never);
          } catch (err) {
            console.error('realtime handler failed', err);
          }
        })
        .subscribe((s) => {
          if (s === 'SUBSCRIBED') setStatus('live');
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('paused');
        });
    };
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(connect, { timeout: 2000 })
      : window.setTimeout(connect, 300);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle); else window.clearTimeout(idle);
      if (channel) supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [key, table, filter, attempt, saver]);

  return { status, retry: () => setAttempt((a) => a + 1) };
}
