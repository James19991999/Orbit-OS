'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError, Banner } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { safeNext } from '@/lib/auth/redirect';

export function SignupForm({ next, invitedEmail }: { next?: string; invitedEmail?: string }) {
  const router = useRouter();
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
    if (name.trim().length < 2) return setError('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid work email.');
    if (password.length < 10) return setError('Use at least 10 characters for your password.');
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
        <h1 className="text-headline-lg-mobile">Check your inbox</h1>
        <Banner tone="info">We sent a confirmation link to <strong>{email}</strong>. Open it on this device to finish setting up your workspace.</Banner>
        <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Create your workspace</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">14-day free trial of Pro. No card or M-Pesa needed to start.</p>
      </div>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Input label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Work email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={!!invitedEmail} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
        <InlineError message={error} />
        <Button type="submit" loading={busy}>Create account</Button>
        <p className="text-body-sm text-on-surface-variant">By continuing you agree to the <Link href="/legal/terms" className="text-primary hover:underline">Terms</Link> and <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.</p>
      </form>
      <p className="text-center text-body-md text-on-surface-variant">Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary hover:underline">Sign in</Link></p>
    </div>
  );
}
