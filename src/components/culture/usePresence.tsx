'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { useDataSaver } from '@/components/shell/DataSaver';

export interface PresenceMeta { user_id: string; name: string; city: string | null; room?: string | null; typing?: boolean }

/** Supabase Realtime Presence for a topic. Status 'paused' when realtime is unreachable (UI stays honest). */
export function usePresence(topic: string, me: PresenceMeta | null) {
  const [peers, setPeers] = useState<PresenceMeta[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'paused'>('connecting');
  const [track, setTrack] = useState<((m: Partial<PresenceMeta>) => void) | null>(null);
  const saver = useDataSaver();
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb || !me || saver) { setStatus('paused'); return; }
    const ch = sb.channel(topic, { config: { presence: { key: me.user_id } } });
    let current: PresenceMeta = me;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceMeta>();
      setPeers(Object.values(state).map((arr) => arr[0]).filter(Boolean));
    }).subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('live');
        await ch.track(current);
        setTrack(() => (m: Partial<PresenceMeta>) => { current = { ...current, ...m }; void ch.track(current); });
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('paused');
    });
    return () => { void sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, me?.user_id, saver]);
  return { peers, status, update: track ?? (() => undefined) };
}

type Ctx = ReturnType<typeof usePresence>;
const PresenceCtx = createContext<Ctx | null>(null);

/** One presence channel per page; children read it via usePresenceContext(). */
export function PresenceProvider({ topic, me, children }: { topic: string; me: PresenceMeta; children: React.ReactNode }) {
  const value = usePresence(topic, me);
  return <PresenceCtx.Provider value={value}>{children}</PresenceCtx.Provider>;
}
export function usePresenceContext(): Ctx {
  return useContext(PresenceCtx) ?? { peers: [], status: 'paused', update: () => undefined };
}
