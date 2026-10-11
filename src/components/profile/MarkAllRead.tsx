'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

export function MarkAllRead({ userId }: { userId: string }) {
  const t = useT();
  const router = useRouter();
  const a = useAction(async () => unwrap(await requireBrowserClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null).select('id')), { success: t('notif.empty') });
  return <Button variant="secondary" icon="done_all" loading={a.pending} onClick={async () => { if (await a.run()) router.refresh(); }}>{t('notif.mark_all')}</Button>;
}
