'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Switch, InlineError, Banner } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

/**
 * Link a WhatsApp number (6-digit code sent by WhatsApp), then choose what arrives there:
 * check-in reminders you can answer by replying, and Approve/Reject buttons for expenses.
 */
export function WhatsAppPanel({ userId, linkedPhone, checkins, approvals, configured }:
  { userId: string; linkedPhone: string | null; checkins: boolean; approvals: boolean; configured: boolean }) {
  const router = useRouter();
  const t = useT();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const start = useAction(async () => postJson<{ to: string }>('/api/whatsapp/link', { action: 'start', phone }), { success: t('wap.code_sent') });
  const verify = useAction(async () => postJson('/api/whatsapp/link', { action: 'verify', code }), { success: t('wap.linked_toast') });
  const unlink = useAction(async () => postJson('/api/whatsapp/link', undefined, 'DELETE'), { success: t('wap.unlinked_toast') });
  const prefs = useAction(async (patch: Record<string, boolean>) => unwrap(await requireBrowserClient().from('profiles').update(patch).eq('id', userId).select('id')), { success: t('wap.prefs_saved') });

  if (!configured) {
    return <Banner tone="info" icon="chat">{t('wap.off')}</Banner>;
  }
  if (linkedPhone) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body-md">{t('wap.linked', { phone: linkedPhone })}</p>
        <Switch label={t('wap.checkins')} description={t('wap.checkins_sub')} checked={checkins} onChange={async (v) => { if (await prefs.run({ whatsapp_checkins: v })) router.refresh(); }} />
        <Switch label={t('wap.approvals')} description={t('wap.approvals_sub')} checked={approvals} onChange={async (v) => { if (await prefs.run({ whatsapp_approvals: v })) router.refresh(); }} />
        <div><Button variant="ghost" size="sm" icon="link_off" loading={unlink.pending} onClick={async () => { if (await unlink.run()) router.refresh(); }}>{t('wap.unlink')}</Button></div>
        <InlineError message={prefs.error ?? unlink.error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-on-surface-variant">{t('wap.intro')}</p>
      {!sentTo ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const r = await start.run(); if (r) setSentTo(r.to); }}>
          <div className="w-full sm:w-72"><Input label={t('wap.number')} inputMode="tel" autoComplete="tel" placeholder="+254 712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} hint={t('wap.number_hint')} /></div>
          <Button type="submit" loading={start.pending} icon="send">{t('wap.send_code')}</Button>
        </form>
      ) : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); if (await verify.run()) { setSentTo(null); setCode(''); router.refresh(); } }}>
          <div className="w-full sm:w-48"><Input label={t('wap.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} hint={t('wap.sent_to', { phone: sentTo })} /></div>
          <Button type="submit" loading={verify.pending} icon="verified">{t('wap.link')}</Button>
          <Button type="button" variant="ghost" onClick={() => { setSentTo(null); setCode(''); }}>{t('wap.other')}</Button>
        </form>
      )}
      <InlineError message={start.error ?? verify.error} />
    </div>
  );
}
