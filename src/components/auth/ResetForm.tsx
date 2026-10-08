'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';

export function ResetForm() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 10) return setError('Use at least 10 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your reset link has expired. Request a new one.');
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
      <h1 className="text-center text-headline-lg-mobile md:text-headline-lg">Choose a new password</h1>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Input label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters." />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <InlineError message={error} />
        <Button type="submit" loading={busy}>Update password</Button>
      </form>
    </div>
  );
}
