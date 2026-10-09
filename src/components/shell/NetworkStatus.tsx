'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { flushCheckins, queuedCount } from '@/lib/offline/queue';
import { useT } from '@/i18n/client';

/** Offline banner + sends check-ins that were saved on this device while offline. */
export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const { toast } = useToast();
  const router = useRouter();
  const t = useT();
  useEffect(() => {
    const sync = async () => {
      const sb = getBrowserClient();
      if (!sb || !navigator.onLine) return;
      const sent = await flushCheckins(sb).catch(() => 0);
      setQueued(queuedCount());
      if (sent) { toast(t('net.sent', { count: sent })); router.refresh(); }
    };
    const up = () => { setOnline(true); void sync(); };
    const down = () => { setOnline(false); setQueued(queuedCount()); };
    const recount = () => setQueued(queuedCount());
    setOnline(navigator.onLine);
    setQueued(queuedCount());
    void sync();
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('orbit:queued', recount);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); window.removeEventListener('orbit:queued', recount); };
  }, [router, toast, t]);
  if (online && !queued) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-body-sm text-on-surface">
      <Icon name={online ? 'cloud_upload' : 'cloud_off'} className="text-[18px] text-warning" />
      {online
        ? t('net.waiting', { count: queued })
        : queued ? t('net.offline_queued', { count: queued }) : t('net.offline')}
    </div>
  );
}
