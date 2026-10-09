'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Switch, InlineError, Banner } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';

/**
 * Link a WhatsApp number (6-digit code sent by WhatsApp), then choose what arrives there:
 * check-in reminders you can answer by replying, and Approve/Reject buttons for expenses.
 */
export function WhatsAppPanel({ userId, linkedPhone, checkins, approvals, configured }:
  { userId: string; linkedPhone: string | null; checkins: boolean; approvals: boolean; configured: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const start = useAction(async () => postJson<{ to: string }>('/api/whatsapp/link', { action: 'start', phone }), { success: 'Code sent on WhatsApp' });
  const verify = useAction(async () => postJson('/api/whatsapp/link', { action: 'verify', code }), { success: 'WhatsApp linked' });
  const unlink = useAction(async () => postJson('/api/whatsapp/link', undefined, 'DELETE'), { success: 'WhatsApp unlinked' });
  const prefs = useAction(async (patch: Record<string, boolean>) => unwrap(await requireBrowserClient().from('profiles').update(patch).eq('id', userId).select('id')), { success: 'Preferences saved' });

  if (!configured) {
    return <Banner tone="info" icon="chat">WhatsApp isn&apos;t switched on for this workspace&apos;s deployment yet. Your administrator can enable it in the server settings.</Banner>;
  }
  if (linkedPhone) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body-md">Linked to <strong className="tnum">{linkedPhone}</strong>. Reply to a reminder with what you shipped — start with 1–5 for your mood, and add &quot;Blockers:&quot; if anything is in your way. Send HELP any time.</p>
        <Switch label="Check-in reminders on WhatsApp" description="At 16:00 your time on working days, instead of email." checked={checkins} onChange={async (v) => { if (await prefs.run({ whatsapp_checkins: v })) router.refresh(); }} />
        <Switch label="Expense approvals on WhatsApp" description="Approve or reject expenses that need you, with one tap." checked={approvals} onChange={async (v) => { if (await prefs.run({ whatsapp_approvals: v })) router.refresh(); }} />
        <div><Button variant="ghost" size="sm" icon="link_off" loading={unlink.pending} onClick={async () => { if (await unlink.run()) router.refresh(); }}>Unlink this number</Button></div>
        <InlineError message={prefs.error ?? unlink.error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-on-surface-variant">Check in by replying to a message, and approve expenses with one tap — without opening the app.</p>
      {!sentTo ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const r = await start.run(); if (r) setSentTo(r.to); }}>
          <div className="w-full sm:w-72"><Input label="WhatsApp number" inputMode="tel" autoComplete="tel" placeholder="+254 712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Include the country code." /></div>
          <Button type="submit" loading={start.pending} icon="send">Send code</Button>
        </form>
      ) : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); if (await verify.run()) { setSentTo(null); setCode(''); router.refresh(); } }}>
          <div className="w-full sm:w-48"><Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} hint={`Sent to ${sentTo}`} /></div>
          <Button type="submit" loading={verify.pending} icon="verified">Link number</Button>
          <Button type="button" variant="ghost" onClick={() => { setSentTo(null); setCode(''); }}>Use another number</Button>
        </form>
      )}
      <InlineError message={start.error ?? verify.error} />
    </div>
  );
}
