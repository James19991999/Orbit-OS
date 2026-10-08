'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Avatar, Button, Input, Select, Switch, InlineError, EmptyState, useToast, Banner, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson, errorMessage } from '@/hooks/useAction';
import { applyTheme } from '@/components/shell/theme';

import type { Profile } from '@/lib/types';
import { useFormat, setLocaleCookie } from '@/lib/locale/client';
import { REGION_OPTIONS, formatDate } from '@/lib/locale';
import { formatMoney } from '@/lib/format';

function zones(): string[] {
  try { const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf; if (f) return f('timeZone'); } catch { /* fallback */ }
  return ['Africa/Nairobi', 'Africa/Lagos', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'];
}

export function PersonalForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const tzs = useMemo(zones, []);
  const [f, setF] = useState({ full_name: profile.full_name, city: profile.city ?? '', country_code: profile.country_code ?? '', timezone: profile.timezone,
    work_start: profile.work_start.slice(0, 5), work_end: profile.work_end.slice(0, 5), theme: profile.theme });
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const save = useAction(async () => unwrap(await requireBrowserClient().from('profiles').update({
    full_name: f.full_name.trim(), city: f.city.trim() || null, country_code: f.country_code.trim().toUpperCase() || null, timezone: f.timezone,
    work_start: f.work_start, work_end: f.work_end, theme: f.theme,
  }).eq('id', profile.id).select('id')), { success: 'Profile saved' });
  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) { toast('Use an image under 2 MB.', 'error'); return; }
    setUploading(true);
    try {
      const sb = requireBrowserClient();
      const path = `${profile.id}/${Date.now()}.${file.name.split('.').pop()?.toLowerCase() || 'png'}`;
      const up = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      unwrap(await sb.from('profiles').update({ avatar_url: url }).eq('id', profile.id).select('id'));
      setAvatar(url); toast('Photo updated'); router.refresh();
    } catch (e) { toast(`Upload failed: ${errorMessage(e)}`, 'error'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (!f.full_name.trim()) return; if (await save.run()) { applyTheme(f.theme); router.refresh(); } }}>
      <div className="flex items-center gap-4 md:col-span-2">
        <Avatar name={f.full_name || 'You'} src={avatar} size={64} />
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" icon="photo_camera" loading={uploading} onClick={() => fileRef.current?.click()}>Change photo</Button>
      </div>
      <Input label="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
      <Select label="Time zone" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} options={tzs.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} />
      <Input label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      <Input label="Country code" maxLength={2} placeholder="KE" value={f.country_code} onChange={(e) => setF({ ...f, country_code: e.target.value })} />
      <Input label="Work day starts" type="time" value={f.work_start} onChange={(e) => setF({ ...f, work_start: e.target.value })} />
      <Input label="Work day ends" type="time" value={f.work_end} onChange={(e) => setF({ ...f, work_end: e.target.value })} />
      <Select label="Theme" value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value as Profile['theme'] })} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
      <div className="flex items-end"><Button type="submit" loading={save.pending}>Save profile</Button></div>
      <div className="md:col-span-2"><InlineError message={save.error} /></div>
    </form>
  );
}

export function NotificationPrefs({ profile }: { profile: Profile }) {
  const router = useRouter();
  const save = useAction(async (patch: Partial<Profile>) => unwrap(await requireBrowserClient().from('profiles').update(patch).eq('id', profile.id).select('id')), { success: 'Preferences saved' });
  return (
    <div className="flex flex-col gap-4">
      <Switch label="Email notifications" description="Kudos, assignments, payment results and meeting invites." checked={profile.email_notifications} onChange={async (v) => { if (await save.run({ email_notifications: v })) router.refresh(); }} />
      <Switch label="Daily check-in reminder" description="An email at 16:00 your time on working days if you haven't checked in." checked={profile.checkin_reminders} onChange={async (v) => { if (await save.run({ checkin_reminders: v })) router.refresh(); }} />
      <InlineError message={save.error} />
    </div>
  );
}

interface Factor { id: string; friendly_name?: string; status: string; created_at: string }
interface Passkey { id: string; label: string; created_at: string }

export function SecurityPanel({ passkeys, aal }: { passkeys: Passkey[]; aal: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorErr, setFactorErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  useEffect(() => {
    requireBrowserClient().auth.mfa.listFactors().then(({ data, error }) => {
      if (error) setFactorErr(error.message); else setFactors((data?.totp ?? []) as Factor[]);
    }).catch((e) => setFactorErr(errorMessage(e)));
  }, []);
  const changePw = useAction(async () => { const { error } = await requireBrowserClient().auth.updateUser({ password: pw.a }); if (error) throw error; }, { success: 'Password changed' });
  const removeFactor = useAction(async (id: string) => { const { error } = await requireBrowserClient().auth.mfa.unenroll({ factorId: id }); if (error) throw error; setFactors((f) => (f ?? []).filter((x) => x.id !== id)); }, { success: 'Authenticator removed' });
  const addPasskey = useAction(async () => {
    const o = await postJson<{ challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/api/auth/passkey/register/options');
    const att = await startRegistration({ optionsJSON: o.options });
    await postJson('/api/auth/passkey/register/verify', { challengeId: o.challengeId, response: att, label: navigator.platform ? `Passkey (${navigator.platform})` : 'Passkey' });
  }, { success: 'Passkey added' });
  async function removePasskey(id: string) {
    const { error } = await requireBrowserClient().from('passkeys').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else { toast('Passkey removed'); router.refresh(); }
  }
  const verified = (factors ?? []).filter((f) => f.status === 'verified');
  return (
    <div className="flex flex-col gap-6">
      <div id="mfa">
        <h3 className="text-label-md">Two-factor authentication (authenticator app)</h3>
        {factorErr && <InlineError message={`Couldn't load your factors: ${factorErr}`} />}
        {factors === null && !factorErr ? <p className="text-body-sm text-on-surface-variant">Loading…</p> : verified.length === 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3"><p className="text-body-sm text-on-surface-variant">Not set up.</p><Link href="/mfa?next=/profile" className="text-label-sm text-primary hover:underline">Set up two-factor</Link></div>
        ) : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {verified.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-body-md">
                <span>{f.friendly_name || 'Authenticator'} <span className="text-body-sm text-on-surface-variant">· added <TimeAgo date={f.created_at} /></span></span>
                <Button size="sm" variant="ghost" disabled={aal !== 'aal2'} title={aal !== 'aal2' ? 'Verify with this factor first' : undefined} loading={removeFactor.pending} onClick={() => removeFactor.run(f.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        {verified.length > 0 && aal !== 'aal2' && <p className="mt-1 text-body-sm text-on-surface-variant">This session isn&apos;t two-factor verified. <Link href="/mfa?next=/profile" className="text-primary underline">Verify now</Link></p>}
      </div>
      <div>
        <h3 className="text-label-md">Passkeys (YubiKey, Touch ID, Face ID, Windows Hello)</h3>
        {passkeys.length === 0 ? <EmptyState className="mt-2" icon="fingerprint" title="No passkeys yet" body="Add one to sign in without a password." /> : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-body-md">
                <span>{p.label} <span className="text-body-sm text-on-surface-variant">· added <TimeAgo date={p.created_at} /></span></span>
                <Button size="sm" variant="ghost" onClick={() => removePasskey(p.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-2" size="sm" variant="secondary" icon="add" loading={addPasskey.pending} onClick={async () => { if ((await addPasskey.run()) !== undefined) router.refresh(); }}>Add passkey</Button>
      </div>
      <form className="grid gap-3 md:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault(); setPwErr(null);
        if (pw.a.length < 10) return setPwErr('Use at least 10 characters.');
        if (pw.a !== pw.b) return setPwErr('Passwords do not match.');
        if (await changePw.run() !== undefined) setPw({ a: '', b: '' });
      }}>
        <Input label="New password" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
        <div className="flex items-end"><Button type="submit" variant="secondary" loading={changePw.pending}>Change password</Button></div>
        <div className="md:col-span-3"><InlineError message={pwErr ?? changePw.error} /></div>
      </form>
      {aal === 'aal2' && <Banner tone="info">This session is two-factor verified.</Banner>}
    </div>
  );
}

/** Per-browser choice of date/number conventions (cookie), e.g. an American working from Nairobi. */
export function RegionFormat({ saved }: { saved: string }) {
  const fmt = useFormat();
  const router = useRouter();
  const [value, setValue] = useState(saved);
  const sample = (l: string) => `${formatDate('2026-10-08', 'short', l)} · ${formatMoney(123450, 'USD', { locale: l })}`;
  return (
    <div className="flex flex-col gap-3">
      <Select label="Format dates and numbers for" value={value} onChange={(e) => { setValue(e.target.value); setLocaleCookie(e.target.value); router.refresh(); }}
        options={REGION_OPTIONS.map((o) => ({ value: o.value, label: o.value ? `${o.label} — ${sample(o.value)}` : o.label }))}
        hint={`Currently: ${sample(fmt.locale)}. Saved on this device only.`} />
    </div>
  );
}
