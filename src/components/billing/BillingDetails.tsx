'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

/** Owner: the workspace's KRA PIN for OrbitOS's eTIMS receipts. */
export function BillingDetails({ kraPin, canEdit }: { kraPin: string | null; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pin, setPin] = useState(kraPin ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(async (v: string | null) => postJson('/api/settings/billing-details', { kraPin: v }, 'PATCH'), { success: t('etims.billing.saved') });
  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const v = pin.replace(/\s+/g, '').toUpperCase();
      if (v && !/^[A-Z][0-9]{9}[A-Z]$/.test(v)) return setErr(t('etims.inv.bad_pin'));
      setErr(null);
      if (await save.run(v || null)) router.refresh();
    }}>
      <Input className="sm:w-64" label={t('etims.pin')} hint={t('etims.pin_hint')} value={pin} autoCapitalize="characters" maxLength={20} disabled={!canEdit} onChange={(e) => setPin(e.target.value)} />
      <Button type="submit" className="sm:mt-7" loading={save.pending} disabled={!canEdit}>{t('etims.billing.save')}</Button>
      <InlineError message={err ?? save.error} />
    </form>
  );
}
