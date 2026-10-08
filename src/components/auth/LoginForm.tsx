'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button, Input, Checkbox, Icon, Banner, InlineError } from '@/components/ui';
import { getBrowserClient, setRememberDevice } from '@/lib/supabase/client';
import { safeNext } from '@/lib/auth/redirect';
import { errorMessage, postJson } from '@/hooks/useAction';

const TENANT_KEY = 'orbit_tenant';
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'orbitos.io';

interface Tenant { name: string; slug: string; sso_domain: string | null }

function readTenant(): string {
  try { return localStorage.getItem(TENANT_KEY) ?? ''; } catch { return ''; }
}
function writeTenant(slug: string) {
  try { if (slug) localStorage.setItem(TENANT_KEY, slug); else localStorage.removeItem(TENANT_KEY); } catch { /* storage unavailable */ }
}

export function LoginForm({ next, reason, error: initialError }: { next?: string; reason?: string; error?: string }) {
  const router = useRouter();
  const target = safeNext(next);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantInput, setTenantInput] = useState('');
  const [editingTenant, setEditingTenant] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantBusy, setTenantBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<null | 'password' | 'google' | 'azure' | 'sso' | 'passkey'>(null);
  const [error, setError] = useState<string | null>(initialError ? decodeURIComponent(initialError) : null);
  const [health, setHealth] = useState<'ok' | 'degraded' | 'unknown'>('unknown');

  useEffect(() => {
    const saved = readTenant();
    if (saved) { setTenantInput(saved); void lookupTenant(saved, false); } else setEditingTenant(true);
    fetch('/api/health').then((r) => r.json()).then((d: { status?: string }) => setHealth(d.status === 'ok' ? 'ok' : 'degraded')).catch(() => setHealth('degraded'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookupTenant(slugRaw: string, save = true) {
    const slug = slugRaw.trim().toLowerCase();
    setTenantError(null);
    if (!slug) { setTenant(null); writeTenant(''); return; }
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) { setTenantError('Use 3–40 lowercase letters, numbers or hyphens.'); return; }
    const supabase = getBrowserClient();
    if (!supabase) return;
    setTenantBusy(true);
    try {
      const { data, error: e } = await supabase.rpc('org_by_slug', { p_slug: slug });
      if (e) throw e;
      const t = (data as Tenant[] | null)?.[0];
      if (!t) { setTenantError('No workspace found with that domain.'); setTenant(null); return; }
      setTenant(t);
      setEditingTenant(false);
      if (save) writeTenant(t.slug);
    } catch (err) {
      setTenantError(`Couldn't look up workspace: ${errorMessage(err)}`);
    } finally {
      setTenantBusy(false);
    }
  }

  async function afterSignIn() {
    if (tenant) {
      // best effort: open the workspace the user picked on this screen (server re-verifies membership)
      await postJson('/api/org/switch', { slug: tenant.slug }).catch(() => undefined);
    }
    await postJson('/api/auth/event', { type: 'login' }).catch(() => undefined);
    router.replace(target);
    router.refresh();
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy('password');
    setRememberDevice(remember);
    try {
      const client = getBrowserClient()!; // re-create with remember preference
      const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        await postJson('/api/auth/event', { type: 'login_failed', email: email.trim(), slug: tenant?.slug }).catch(() => undefined);
        throw err;
      }
      await afterSignIn();
    } catch (err) {
      const msg = errorMessage(err);
      setError(/invalid login credentials/i.test(msg) ? 'Incorrect email or password.' : /email not confirmed/i.test(msg) ? 'Please confirm your email first — check your inbox.' : msg);
      setBusy(null);
    }
  }

  async function onOAuth(provider: 'google' | 'azure') {
    setError(null);
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(provider);
    setRememberDevice(remember);
    try {
      const { error: err } = await getBrowserClient()!.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}${tenant ? `&org=${tenant.slug}` : ''}`,
          scopes: provider === 'azure' ? 'email' : undefined,
        },
      });
      if (err) throw err;
    } catch (err) {
      setError(`${provider === 'google' ? 'Google' : 'Azure AD'} sign-in failed: ${errorMessage(err)}`);
      setBusy(null);
    }
  }

  async function onSso() {
    if (!tenant?.sso_domain) return;
    setError(null);
    setBusy('sso');
    setRememberDevice(remember);
    try {
      const { data, error: err } = await getBrowserClient()!.auth.signInWithSSO({
        domain: tenant.sso_domain,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}&org=${tenant.slug}` },
      });
      if (err) throw err;
      if (data?.url) window.location.href = data.url;
      else throw new Error('Identity provider did not return a redirect URL');
    } catch (err) {
      setError(`SSO sign-in failed: ${errorMessage(err)}`);
      setBusy(null);
    }
  }

  async function onPasskey() {
    setError(null);
    if (!email.trim()) { setError('Enter your work email first, then use your passkey.'); return; }
    setBusy('passkey');
    setRememberDevice(remember);
    try {
      const opts = await postJson<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
        '/api/auth/passkey/login/options', { email: email.trim() });
      const assertion = await startAuthentication({ optionsJSON: opts.options });
      await postJson('/api/auth/passkey/login/verify', { challengeId: opts.challengeId, response: assertion, remember });
      await afterSignIn();
    } catch (err) {
      const msg = errorMessage(err);
      setError(/NotAllowedError|timed out|cancel/i.test(msg) ? 'Passkey sign-in was cancelled.' : `Passkey sign-in failed: ${msg}`);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-outline-variant bg-surface-container shadow-glow">
          <Icon name="deployed_code" className="text-[28px] text-primary" />
        </span>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Sign in to OrbitOS</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">The distributed operating system for remote-first companies</p>
      </div>

      {reason === 'timeout' && <Banner tone="info">You were signed out after a period of inactivity.</Banner>}
      {reason === 'signed_up' && <Banner tone="info">Account created. Check your inbox to confirm your email, then sign in.</Banner>}
      {reason === 'password_updated' && <Banner tone="info">Password updated. Sign in with your new password.</Banner>}

      <section className="card p-5" aria-labelledby="tenant-label">
        <div className="flex items-center justify-between gap-3">
          <p id="tenant-label" className="flex items-center gap-2 text-label-xs uppercase text-on-surface-variant"><Icon name="domain" className="text-[16px]" />Workspace domain</p>
          {!editingTenant && (
            <button type="button" onClick={() => setEditingTenant(true)} className="text-label-sm text-primary hover:underline">Switch</button>
          )}
        </div>
        {!editingTenant && tenant ? (
          <p className="mt-2 truncate font-mono text-body-md text-on-surface">{tenant.slug}.{rootDomain} <span className="font-sans text-on-surface-variant">· {tenant.name}</span></p>
        ) : (
          <form className="mt-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void lookupTenant(tenantInput); }}>
            <div className="flex-1">
              <Input label="Workspace subdomain" hideLabel placeholder="your-company" value={tenantInput} onChange={(e) => setTenantInput(e.target.value)}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="tenant-suffix" />
            </div>
            <span id="tenant-suffix" className="pb-3 text-body-sm text-on-surface-variant md:pb-2.5">.{rootDomain}</span>
            <Button type="submit" variant="secondary" size="sm" className="mb-1" loading={tenantBusy}>Save</Button>
          </form>
        )}
        <InlineError message={tenantError} />
        {!tenant && editingTenant && <p className="mt-1 text-body-sm text-on-surface-variant">Optional — enables your company&apos;s single sign-on.</p>}
      </section>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" icon="security_key" onClick={onSso} disabled={!tenant?.sso_domain || !!busy} loading={busy === 'sso'}
          aria-describedby={!tenant?.sso_domain ? 'sso-hint' : undefined} className="justify-start">
          Continue with Okta / SAML
        </Button>
        {!tenant?.sso_domain && <p id="sso-hint" className="text-body-sm text-on-surface-variant">{tenant ? 'SSO is not configured for this workspace. Ask your admin.' : 'Set your workspace domain to use SAML single sign-on.'}</p>}
        <Button variant="secondary" icon="cloud_sync" onClick={() => onOAuth('google')} disabled={!!busy} loading={busy === 'google'} className="justify-start">Continue with Google Workspace</Button>
        <Button variant="secondary" icon="corporate_fare" onClick={() => onOAuth('azure')} disabled={!!busy} loading={busy === 'azure'} className="justify-start">Continue with Microsoft Entra ID (Azure AD)</Button>
      </div>

      <div className="flex items-center gap-3 text-label-xs uppercase text-on-surface-variant" aria-hidden>
        <span className="h-px flex-1 bg-outline-variant" />or work email<span className="h-px flex-1 bg-outline-variant" />
      </div>

      <form onSubmit={onPassword} className="flex flex-col gap-4" noValidate>
        <Input label="Work email" type="email" name="email" autoComplete="username webauthn" placeholder="name@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="relative">
          <Input label="Password" type={showPw ? 'text' : 'password'} name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
            className="absolute bottom-1.5 right-1.5 rounded p-1.5 text-on-surface-variant hover:text-on-surface md:bottom-1">
            <Icon name={showPw ? 'visibility_off' : 'visibility'} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Checkbox label="Remember this device for 30 days" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Link href="/forgot-password" className="shrink-0 text-label-sm text-primary hover:underline">Forgot password?</Link>
        </div>
        <InlineError message={error} />
        <Button type="submit" icon="login" loading={busy === 'password'} disabled={!!busy || !email || !password}>Sign in</Button>
      </form>

      <Button variant="ghost" icon="fingerprint" onClick={onPasskey} loading={busy === 'passkey'} disabled={!!busy}>Use a passkey (YubiKey, Touch ID, Face ID)</Button>

      <p className="text-center text-body-md text-on-surface-variant">New to OrbitOS? <Link href="/signup" className="text-primary hover:underline">Create a workspace</Link></p>

      <p className="flex items-center justify-center gap-2 text-body-sm text-on-surface-variant" role="status">
        <Icon name="lock" className="text-[16px]" />Encrypted session (TLS) ·
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${health === 'ok' ? 'bg-healthy pulse-dot' : health === 'degraded' ? 'bg-warning' : 'bg-outline'}`} aria-hidden />
          {health === 'ok' ? 'All systems operational' : health === 'degraded' ? 'Service degraded' : 'Checking status…'}
        </span>
      </p>
    </div>
  );
}
