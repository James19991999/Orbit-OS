'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { SwipeRow } from '@/components/ui/SwipeRow';

import type { FinanceEntry } from '@/lib/types';
import { useFormat } from '@/lib/locale/client';
import { useT } from '@/i18n/client';

export function Approvals({ items, people, userId, canApprove }: { items: FinanceEntry[]; people: Record<string, { name: string }>; userId: string; canApprove: boolean }) {
  const fmt = useFormat();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  async function decide(id: string, approval_status: 'approved' | 'rejected') {
    setBusy(id + approval_status);
    try {
      const { error } = await requireBrowserClient().from('finance_entries').update({ approval_status }).eq('id', id);
      if (error) throw error;
      toast(approval_status === 'approved' ? t('appr.approved') : t('appr.rejected'));
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }
  if (!items.length) return <EmptyState icon="fact_check" title={t('appr.none')} />;
  return (
    <ul className="divide-y divide-outline-variant">
      {items.map((e) => {
        const own = e.created_by === userId;
        return (
          <li key={e.id}>
            <SwipeRow disabled={!canApprove || !!busy}
              right={own ? undefined : { label: t('appr.approve'), icon: 'check_circle', tone: 'healthy', run: () => void decide(e.id, 'approved') }}
              left={{ label: t('appr.reject'), icon: 'cancel', tone: 'alert', run: () => void decide(e.id, 'rejected') }}>
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-label-md">{e.vendor ?? e.category ?? t('appr.expense')} · <span className="tnum">{fmt.money(e.amount_minor, e.currency)}</span></p>
                <p className="text-body-sm text-on-surface-variant">{t('appr.logged_by', { note: e.note ?? '—', name: e.created_by ? people[e.created_by]?.name ?? t('appr.member') : t('appr.system'), date: fmt.date(e.occurred_on) })}</p>
              </div>
              {canApprove && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => decide(e.id, 'rejected')} loading={busy === e.id + 'rejected'} disabled={!!busy}>{t('appr.reject')}</Button>
                  <Button size="sm" onClick={() => decide(e.id, 'approved')} loading={busy === e.id + 'approved'} disabled={!!busy || own}
                    title={own ? t('appr.own') : undefined}>{t('appr.approve')}</Button>
                </div>
              )}
              </div>
            </SwipeRow>
          </li>
        );
      })}
    </ul>
  );
}
