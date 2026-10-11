'use client';
import { useCallback, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { Avatar, Icon, EmptyState, TimeAgo } from '@/components/ui';
import { useRealtime } from '@/hooks/useRealtime';
import { useT } from '@/i18n/client';
import { localizeActivity } from '@/lib/notification-text';


export interface ActivityEvent { id: string; created_at: string; actor_id: string | null; actor_name: string | null; kind: string; title: string; body: string | null; link: string | null }
const ICON: Record<string, string> = { task_done: 'task_alt', checkin: 'edit_note', kudos: 'stars', invoice_paid: 'payments', expense_approved: 'fact_check', github_pr_merged: 'merge', github_push: 'commit' };

export function ActivityStream({ orgId, initial, cities }: { orgId: string; initial: ActivityEvent[]; cities: Record<string, string | null> }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const onChange = useCallback((p: { eventType: string; new: Record<string, unknown> }) => {
    if (p.eventType === 'INSERT') setItems((s) => [p.new as unknown as ActivityEvent, ...s].slice(0, 50));
  }, []);
  const { status, retry } = useRealtime(`activity-${orgId}`, 'activity_events', `org_id=eq.${orgId}`, onChange);
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-body-sm text-on-surface-variant" role="status">
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'live' ? 'bg-healthy pulse-dot' : status === 'paused' ? 'bg-warning' : 'bg-outline'}`} aria-hidden />
        {status === 'live' ? t('act.live') : status === 'paused' ? <>{t('act.paused')} <button type="button" className="underline" onClick={retry}>{t('common.retry')}</button></> : t('act.connecting')}
      </p>
      {items.length === 0 ? <EmptyState icon="dynamic_feed" title={t('act.none')} body={t('act.none_body')} /> : (
        <ol className="flex flex-col">
          {items.map((raw) => { const e = { ...raw, title: localizeActivity(raw, t) }; return (
            <li key={e.id} className="flex gap-3 border-b border-outline-variant py-3 last:border-0">
              <Avatar name={e.actor_name ?? 'System'} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-body-md"><strong className="font-medium">{e.actor_name ?? 'OrbitOS'}</strong>{' '}
                  <span className="text-on-surface-variant"><TimeAgo date={e.created_at} />{e.actor_id && cities[e.actor_id] ? ` · ${cities[e.actor_id]}` : ''}</span></p>
                <p className="flex items-center gap-1.5 text-body-md text-on-surface">
                  <Icon name={ICON[e.kind] ?? 'bolt'} className="text-[16px] text-secondary" />
                  {e.link ? <Link href={e.link} className="hover:underline">{e.title}</Link> : e.title}
                </p>
                {e.body && <p className="truncate text-body-sm text-on-surface-variant">{e.body}</p>}
              </div>
            </li>
          ); })}
        </ol>
      )}
    </div>
  );
}
