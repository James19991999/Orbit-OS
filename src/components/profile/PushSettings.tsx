'use client';
import { useEffect, useState } from 'react';
import { Button, Icon, useToast } from '@/components/ui';
import { postJson, errorMessage } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

type State = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

const keyBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Profile → turn phone/desktop notifications on or off for this device, and send a test. */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const t = useT();
  const { toast } = useToast();
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    navigator.serviceWorker.getRegistration('/').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    }).catch(() => setState('off'));
  }, []);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return; }
      const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await postJson('/api/push/subscribe', sub.toJSON());
      setState('on');
      toast(t('push.turned_on'), 'success');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
      if (sub) { await postJson('/api/push/subscribe', { endpoint: sub.endpoint }, 'DELETE').catch(() => undefined); await sub.unsubscribe(); }
      setState('off');
      toast(t('push.turned_off'), 'success');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { await postJson('/api/push/test'); toast(t('push.test_sent'), 'success'); } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-on-surface-variant">{t('push.body')}</p>
      {!publicKey ? <p className="text-body-sm text-on-surface-variant">{t('push.not_configured')}</p>
        : state === 'unsupported' ? <p className="text-body-sm text-on-surface-variant">{t('push.unsupported')}</p>
        : state === 'denied' ? <p className="flex items-center gap-2 text-body-sm text-warning"><Icon name="notifications_off" className="text-[18px]" />{t('push.denied')}</p>
        : state === 'on' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-body-md text-healthy"><Icon name="check_circle" filled className="text-[18px]" />{t('push.enabled')}</span>
            <Button size="sm" variant="secondary" icon="send" loading={busy} onClick={() => void test()}>{t('push.test')}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void turnOff()}>{t('push.off')}</Button>
          </div>
        ) : <Button icon="notifications_active" loading={busy || state === 'checking'} onClick={() => void turnOn()} className="self-start">{t('push.on')}</Button>}
    </div>
  );
}
