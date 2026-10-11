'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banner, Button, Dialog, InlineError, TimeAgo } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/shared';

export interface CalendarConnectionView { provider: 'google' | 'microsoft'; accountEmail: string; status: 'active' | 'error'; lastError: string | null; busySyncedAt: string | null }

/** Profile → Calendar: connect Google Calendar or Outlook (one per person). */
export function CalendarPanel({ connection, providers }: { connection: CalendarConnectionView | null; providers: { google: boolean; microsoft: boolean } }) {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => { setResult(sp.get('calendar')); }, [sp]);
  const disconnect = useAction(async () => postJson('/api/calendar', undefined, 'DELETE'), { success: t('cal.disconnected_toast') });
  const any = providers.google || providers.microsoft;
  const resultKey = result && ['connected', 'denied', 'error', 'invalid', 'no_offline'].includes(result) ? (`cal.result.${result}` as MessageKey) : null;

  return (
    <div className="flex flex-col gap-3">
      {resultKey && <Banner tone={result === 'connected' ? 'info' : 'warning'}>{t(resultKey)}</Banner>}
      <p className="text-body-md text-on-surface-variant">{t('cal.intro')}</p>
      {connection ? (
        <>
          <p className="text-body-md" data-testid="calendar-connected">{t('cal.connected_as', { provider: t(`cal.provider.${connection.provider}` as MessageKey), email: connection.accountEmail })}</p>
          {connection.status === 'error'
            ? <Banner tone="alert">{t('cal.error', { msg: connection.lastError ?? '' })}</Banner>
            : <p className="text-body-sm text-on-surface-variant">{t('cal.last_read')}: {connection.busySyncedAt ? <TimeAgo date={connection.busySyncedAt} /> : t('cal.never')}</p>}
          <div className="flex flex-wrap gap-2">
            {connection.status === 'error' && providers[connection.provider] && (
              <a href={`/api/calendar/connect?provider=${connection.provider}`} className="inline-flex h-9 items-center rounded bg-primary-container px-3 text-label-md text-on-primary-container">{t('cal.reconnect')}</a>
            )}
            <Button size="sm" variant="ghost" icon="link_off" onClick={() => setConfirm(true)}>{t('cal.disconnect')}</Button>
          </div>
        </>
      ) : any ? (
        <div className="flex flex-wrap gap-2">
          {providers.google && <a href="/api/calendar/connect?provider=google" className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant bg-surface-container-high px-3 text-label-md hover:bg-on-surface/5">{t('cal.connect_google')}</a>}
          {providers.microsoft && <a href="/api/calendar/connect?provider=microsoft" className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant bg-surface-container-high px-3 text-label-md hover:bg-on-surface/5">{t('cal.connect_microsoft')}</a>}
        </div>
      ) : (
        <p className="text-body-sm text-on-surface-variant">{t('cal.not_configured')}</p>
      )}
      <p className="text-body-sm text-on-surface-variant">{t('cal.privacy')}</p>
      <InlineError message={disconnect.error} />
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('cal.disconnect')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={disconnect.pending} onClick={async () => { if (await disconnect.run()) { setConfirm(false); router.replace('/profile#calendar'); router.refresh(); } }}>{t('cal.disconnect')}</Button></>}>
        <p className="text-body-md">{t('cal.disconnect_note')}</p>
      </Dialog>
    </div>
  );
}
