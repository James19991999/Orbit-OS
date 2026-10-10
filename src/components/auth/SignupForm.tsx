'use client';
import { useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError, Banner } from '@/components/ui';
import { errorMessage } from '@/hooks/useAction';
import { safeNext } from '@/lib/auth/redirect';
import { useT } from '@/i18n/client';

export function SignupForm({ next, invitedEmail }: { next?: string; invitedEmail?: string }) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);
  const target = safeNext(next, '/onboarding');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t('signup.err_name'));
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t('signup.err_email'));
    if (password.length < 10) return setError(t('signup.err_password'));
    const { getBrowserClient } = await import('@/lib/supabase/client'); // loaded on submit, not with the page
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim(), timezone }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
      });
      if (err) throw err;
      // With email confirmation ON, Supabase returns a user but NO session — don't push into a protected route.
      if (!data.session) { setCheckInbox(true); return; }
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (checkInbox) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-headline-lg-mobile">{t('signup.check_inbox')}</h1>
        <Banner tone="info">{t('signup.sent', { email })}</Banner>
        <Link href="/login" className="text-primary hover:underline">{t('auth.back_to_signin')}</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('signup.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('signup.subtitle')}</p>
      </div>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Input label={t('signup.full_name')} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label={t('auth.work_email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={!!invitedEmail} />
        <Input label={t('auth.password')} type="password" autoComplete="new-password" hint={t('auth.min_password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <InlineError message={error} />
        <Button type="submit" loading={busy}>{t('signup.create')}</Button>
        <p className="text-body-sm text-on-surface-variant">{t('signup.agree_1')} <Link href="/legal/terms" className="text-primary underline">{t('signup.terms')}</Link> {t('signup.and')} <Link href="/legal/privacy" className="text-primary underline">{t('auth.privacy')}</Link>.</p>
      </form>
      <p className="text-center text-body-md text-on-surface-variant">{t('signup.have_account')} <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary underline">{t('auth.sign_in')}</Link></p>
    </div>
  );
}
