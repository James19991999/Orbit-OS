'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, cn, TimeAgo } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { useRealtime } from '@/hooks/useRealtime';
import { useT } from '@/i18n/client';

import type { Notification } from '@/lib/types';

export function NotificationsBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    const [list, count] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
    ]);
    if (list.error || count.error) { setError((list.error ?? count.error)!.message); return; }
    setError(null);
    setItems(list.data as Notification[]);
    setUnread(count.count ?? 0);
  }, [userId]);

  useEffect(() => { load().catch((e) => setError(String(e))); }, [load]);
  const { status, retry } = useRealtime(`notif-${userId}`, 'notifications', `user_id=eq.${userId}`, () => { load().catch(() => undefined); });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function markAll() {
    const supabase = getBrowserClient();
    if (!supabase) return;
    const { error: e } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
    if (e) { setError(e.message); return; }
    await load();
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? t('notif.unread', { count: unread }) : t('notif.title')} className="relative rounded p-2 text-on-surface-variant hover:bg-on-surface/5">
        <Icon name="notifications" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[10px] font-bold text-white dark:text-black" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label={t('notif.title')} className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-outline-variant bg-surface-container-high shadow-l2">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <p className="text-label-md">{t('notif.title')}</p>
            {unread > 0 && <button type="button" onClick={markAll} className="text-label-sm text-primary hover:underline">{t('notif.mark_all')}</button>}
          </div>
          {status === 'paused' && (
            <p className="flex items-center gap-2 border-b border-outline-variant px-4 py-2 text-body-sm text-warning">
              <Icon name="sync_problem" className="text-[16px]" />{t('notif.paused')}
              <button type="button" onClick={retry} className="underline">{t('notif.retry')}</button>
            </p>
          )}
          {error && <p role="alert" className="px-4 py-2 text-body-sm text-alert">{t('notif.load_failed', { error })}</p>}
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && !error && <li className="px-4 py-6 text-center text-body-sm text-on-surface-variant">{t('notif.empty')}</li>}
            {items.map((n) => (
              <li key={n.id} className="border-b border-outline-variant last:border-0">
                <Link href={n.link ?? '/notifications'} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-on-surface/5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary-container')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-body-md text-on-surface">{n.title}</span>
                    {n.body && <span className="block truncate text-body-sm text-on-surface-variant">{n.body}</span>}
                    <span className="block text-body-sm text-on-surface-variant"><TimeAgo date={n.created_at} />{!n.read_at && <span className="sr-only">{t('notif.unread_sr')}</span>}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-outline-variant px-4 py-2.5 text-center text-label-sm text-primary hover:underline">{t('notif.view_all')}</Link>
        </div>
      )}
    </div>
  );
}
