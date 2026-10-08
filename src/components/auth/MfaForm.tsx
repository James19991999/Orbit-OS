'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError, Banner } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { safeNext } from '@/lib/auth/redirect';

/** Enrol a TOTP authenticator (first time) or complete an MFA challenge to reach AAL2. */
export function MfaForm({ next, required }: { next?: string; required?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'loading' | 'enroll' | 'challenge'>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = safeNext(next);

  useEffect(() => {
    (async () => {
      const supabase = getBrowserClient();
      if (!supabase) return;
      try {
        const { data, error: e } = await supabase.auth.mfa.listFactors();
        if (e) throw e;
        const verified = data.totp.find((f) => f.status === 'verified');
        if (verified) { setFactorId(verified.id); setMode('challenge'); return; }
        // clean up abandoned unverified factors, then enrol a fresh one
        for (const f of data.all.filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
        const en = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `OrbitOS ${new Date().toISOString().slice(0, 10)}` });
        if (en.error) throw en.error;
        setFactorId(en.data.id);
        setQr(en.data.totp.qr_code);
        setSecret(en.data.totp.secret);
        setMode('enroll');
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app.');
    const supabase = getBrowserClient();
    if (!supabase || !factorId) return;
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (err) throw err;
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(/invalid/i.test(errorMessage(err)) ? 'That code is not valid. Check your device clock and try again.' : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{mode === 'enroll' ? 'Set up two-factor authentication' : 'Verify it’s you'}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {mode === 'enroll' ? 'Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the code.' : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>
      {required && <Banner tone="warning">Your workspace requires two-factor authentication for owners and directors.</Banner>}
      <form onSubmit={verify} className="card flex flex-col gap-4 p-5" noValidate>
        {mode === 'loading' && !error && <p className="text-body-md text-on-surface-variant">Preparing…</p>}
        {mode === 'enroll' && qr && (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded bg-white p-2" />
            {secret && <p className="text-center text-body-sm text-on-surface-variant">Can&apos;t scan? Enter this key: <code className="break-all font-mono text-on-surface">{secret}</code></p>}
          </div>
        )}
        {mode !== 'loading' && (
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        )}
        <InlineError message={error} />
        {mode !== 'loading' && <Button type="submit" loading={busy}>Verify</Button>}
      </form>
    </div>
  );
}
