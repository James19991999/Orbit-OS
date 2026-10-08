import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAppContext } from '@/lib/context';
import { must } from '@/lib/data/members';
import { relativeTime } from '@/lib/format';
import { Card, EmptyState } from '@/components/ui';
import { MarkAllRead } from '@/components/profile/MarkAllRead';
import type { Notification } from '@/lib/types';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const { supabase, user } = await requireAppContext();
  const items = must(await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100), 'notifications') as Notification[];
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-headline-lg-mobile md:text-headline-lg">Notifications</h1><p className="text-body-md text-on-surface-variant">{unread} unread</p></div>
        {unread > 0 && <MarkAllRead userId={user.id} />}
      </div>
      <Card>
        {items.length === 0 ? <EmptyState icon="notifications_off" title="No notifications yet" /> : (
          <ul className="divide-y divide-outline-variant">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? '#'} className="flex gap-3 py-3 hover:bg-on-surface/[0.03]">
                  <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-primary-container'}`} aria-hidden />
                  <span className="min-w-0"><span className="block text-label-md">{n.title}{!n.read_at && <span className="sr-only"> (unread)</span>}</span>
                    {n.body && <span className="block text-body-sm text-on-surface-variant">{n.body}</span>}
                    <span className="block text-body-sm text-outline">{relativeTime(n.created_at)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
