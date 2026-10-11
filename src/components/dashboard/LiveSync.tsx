'use client';
import { useEffect, useState } from 'react';
import { useRealtime } from '@/hooks/useRealtime';

import { Pill, TimeAgo } from '@/components/ui';
import { useT } from '@/i18n/client';

/** "Live sync: 12s ago" — time since the last realtime change in this workspace (or page load). */
export function LiveSync({ orgId }: { orgId: string }) {
  const t = useT();
  const [last, setLast] = useState(() => Date.now());
  const [, tick] = useState(0);
  const { status, retry } = useRealtime(`live-${orgId}`, 'tasks', `org_id=eq.${orgId}`, () => setLast(Date.now()));
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15_000); return () => clearInterval(t); }, []);
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center gap-2">
        <Pill tone="warning">{t('live.paused')}</Pill>
        <button type="button" onClick={retry} className="text-label-sm text-primary underline">{t('common.retry')}</button>
      </span>
    );
  }
  return <Pill tone="healthy" pulse>{t('live.synced')} <TimeAgo date={last} /></Pill>;
}
