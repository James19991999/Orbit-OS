'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

export function ResetForm() {
  const router = useRouter();
  const t = useT();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 10) return setError(t('reset.err_short'));
    if (pw !== pw2) return setError(t('reset.err_match'));
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('reset.err_expired'));
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      await supabase.auth.signOut();
      router.replace('/login?reason=password_updated');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-center text-headline-lg-mobile md:text-headline-lg">{t('reset.title')}</h1>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Input label={t('reset.new')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={t('auth.min_password')} />
        <Input label={t('reset.confirm')} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <InlineError message={error} />
        <Button type="submit" loading={busy}>{t('reset.update')}</Button>
      </form>
    </div>
  );
}
