'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, InlineError, Banner } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { safeNext } from '@/lib/auth/redirect';
import { useT } from '@/i18n/client';

/** Enrol a TOTP authenticator (first time) or complete an MFA challenge to reach AAL2. */
export function MfaForm({ next, required }: { next?: string; required?: boolean }) {
  const router = useRouter();
  const t = useT();
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
    if (!/^\d{6}$/.test(code)) return setError(t('mfa.err_format'));
    const supabase = getBrowserClient();
    if (!supabase || !factorId) return;
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (err) throw err;
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(/invalid/i.test(errorMessage(err)) ? t('mfa.err_invalid') : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{mode === 'enroll' ? t('mfa.enroll_title') : t('mfa.challenge_title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {mode === 'enroll' ? t('mfa.enroll_help') : t('mfa.challenge_help')}
        </p>
      </div>
      {required && <Banner tone="warning">{t('mfa.required')}</Banner>}
      <form onSubmit={verify} className="card flex flex-col gap-4 p-5" noValidate>
        {mode === 'loading' && !error && <p className="text-body-md text-on-surface-variant">{t('mfa.preparing')}</p>}
        {mode === 'enroll' && qr && (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={t('mfa.qr_alt')} width={180} height={180} className="rounded bg-white p-2" />
            {secret && <p className="text-center text-body-sm text-on-surface-variant">{t('mfa.cant_scan')} <code className="break-all font-mono text-on-surface">{secret}</code></p>}
          </div>
        )}
        {mode !== 'loading' && (
          <Input label={t('mfa.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        )}
        <InlineError message={error} />
        {mode !== 'loading' && <Button type="submit" loading={busy}>{t('mfa.verify')}</Button>}
      </form>
    </div>
  );
}
