'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Input, InlineError, Banner } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter the email you sign in with.');
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
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Reset your password</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">We&apos;ll email you a secure link.</p>
      </div>
      {sent ? (
        <Banner tone="info">If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 1 hour.</Banner>
      ) : (
        <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
          <Input label="Work email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <InlineError message={error} />
          <Button type="submit" loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="text-center"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
    </div>
  );
}
