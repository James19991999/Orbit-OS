'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Input, InlineError, Banner } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

export function ForgotForm() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t('forgot.err_email'));
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('forgot.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('forgot.subtitle')}</p>
      </div>
      {sent ? (
        <Banner tone="info">{t('forgot.sent', { email })}</Banner>
      ) : (
        <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
          <Input label={t('auth.work_email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <InlineError message={error} />
          <Button type="submit" loading={busy}>{t('forgot.send')}</Button>
        </form>
      )}
      <p className="text-center"><Link href="/login" className="text-primary hover:underline">{t('auth.back_to_signin')}</Link></p>
    </div>
  );
}
