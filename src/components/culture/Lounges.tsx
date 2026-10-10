'use client';
import { useEffect, useState } from 'react';
import { Button, Icon, Pill, AvatarStack, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { focusState, mmss } from './focus';
import { usePresenceContext } from './usePresence';
import type { Lounge } from '@/lib/types';

export function Lounges({ orgSlug, lounges: initial, canWrite }: { orgSlug: string; lounges: Lounge[]; canWrite: boolean }) {
  const [lounges, setLounges] = useState(initial);
  const [room, setRoom] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const { peers, status, update } = usePresenceContext();
  useEffect(() => setLounges(initial), [initial]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { update({ room }); }, [room, update]);

  async function setSession(l: Lounge, start: boolean) {
    setBusy(l.id);
    try {
      const { data, error } = await requireBrowserClient().rpc('set_lounge_session', { p_lounge: l.id, p_start: start });
      if (error) throw error;
      setLounges((s) => s.map((x) => (x.id === l.id ? { ...x, session_started_at: data as string | null } : x)));
    } catch (e) {
      toast(`Couldn't ${start ? 'start' : 'stop'} the session: ${errorMessage(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  }
  function join(l: Lounge) {
    setRoom(l.id);
    if (l.kind === 'hangout') window.open(`https://meet.jit.si/orbitos-${orgSlug}-${l.room_code}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lounges.map((l) => {
        const inRoom = peers.filter((p) => p.room === l.id);
        const fs = focusState(l.session_started_at, l.focus_minutes, l.break_minutes, l.rounds, now);
        const here = room === l.id;
        return (
          <article key={l.id} className="card glow-focal p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant"><Icon name={l.kind === 'hangout' ? 'graphic_eq' : 'timer'} className="text-[16px]" />{l.kind === 'hangout' ? 'Open hangout' : `Deep coworking (${l.focus_minutes}/${l.break_minutes})`}</p>
                <h2 className="mt-1 text-headline-sm">{l.name}</h2>
                {l.description && <p className="text-body-sm text-on-surface-variant">{l.description}</p>}
              </div>
              {status === 'live' ? <Pill tone={inRoom.length ? 'healthy' : 'neutral'} pulse={inRoom.length > 0}>{inRoom.length} here</Pill> : <Pill tone="neutral">Presence {status === 'paused' ? 'offline' : '…'}</Pill>}
            </div>
            {l.kind === 'focus' && (
              <div className="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-4" aria-live="polite">
                {fs.active ? (
                  <>
                    <p className="text-label-sm text-on-surface-variant">{fs.inFocus ? 'Focus sprint' : 'Break'} {fs.round} of {fs.rounds} · mics muted</p>
                    <p className="text-headline-lg tnum">{mmss(fs.remainingMs)} <span className="text-body-sm text-on-surface-variant">left</span></p>
                  </>
                ) : <p className="text-body-md text-on-surface-variant">{'finished' in fs && fs.finished ? 'Session finished. Start another round?' : 'No session running.'}</p>}
              </div>
            )}
            {inRoom.length > 0 && <div className="mt-3"><AvatarStack people={inRoom.map((p) => ({ name: p.name }))} /></div>}
            <div className="mt-4 flex flex-wrap gap-2">
              {l.kind === 'hangout'
                ? <Button icon="headset" onClick={() => join(l)}>{here ? 'Rejoin call' : 'Join lounge'}</Button>
                : <Button icon={here ? 'check' : 'self_improvement'} variant={here ? 'secondary' : 'primary'} onClick={() => setRoom(here ? null : l.id)}>{here ? 'In the room' : 'Sit quietly'}</Button>}
              {l.kind === 'focus' && canWrite && (fs.active
                ? <Button variant="ghost" onClick={() => setSession(l, false)} loading={busy === l.id}>Stop session</Button>
                : <Button variant="secondary" icon="play_arrow" onClick={() => setSession(l, true)} loading={busy === l.id}>Start session</Button>)}
              {here && l.kind === 'hangout' && <Button variant="ghost" onClick={() => setRoom(null)}>Leave</Button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function CitiesLive({ fallbackCities }: { fallbackCities: string[] }) {
  const { peers, status } = usePresenceContext();
  const cities = status === 'live' ? [...new Set(peers.map((p) => p.city).filter(Boolean) as string[])] : fallbackCities;
  return (
    <p className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'live' ? 'bg-healthy pulse-dot' : 'bg-outline'}`} aria-hidden />
      {status === 'live' ? `${peers.length} online · ${cities.length} ${cities.length === 1 ? 'city' : 'cities'} live` : `${fallbackCities.length} cities in the team`}
      {cities.slice(0, 4).map((c) => <span key={c} className="rounded-full border border-outline-variant px-2 py-0.5 text-label-xs uppercase">{c.slice(0, 3)}</span>)}
      {cities.length > 4 && <span className="text-label-xs">+{cities.length - 4}</span>}
    </p>
  );
}
