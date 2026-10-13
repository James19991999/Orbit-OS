'use client';
import { useT } from '@/i18n/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { useRouter } from 'next/navigation';
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
  const t = useT();
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
  }).eq('id', profile.id).select('id')), { success: t('pf.saved') });
  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) { toast(t('pf.img'), 'error'); return; }
    setUploading(true);
    try {
      const sb = requireBrowserClient();
      const path = `${profile.id}/${Date.now()}.${file.name.split('.').pop()?.toLowerCase() || 'png'}`;
      const up = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      unwrap(await sb.from('profiles').update({ avatar_url: url }).eq('id', profile.id).select('id'));
      setAvatar(url); toast(t('pf.photo_ok')); router.refresh();
    } catch (e) { toast(t('pf.upload_failed', { error: errorMessage(e) }), 'error'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (!f.full_name.trim()) return; if (await save.run()) { applyTheme(f.theme); router.refresh(); } }}>
      <div className="flex items-center gap-4 md:col-span-2">
        <Avatar name={f.full_name || t('pf.you')} src={avatar} size={64} />
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" icon="photo_camera" loading={uploading} onClick={() => fileRef.current?.click()}>{t('pf.photo')}</Button>
      </div>
      <Input label={t('pf.name')} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
      <Select label={t('pf.tz')} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} options={tzs.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} />
      <Input label={t('pf.city')} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      <Input label={t('pf.country')} maxLength={2} placeholder="KE" value={f.country_code} onChange={(e) => setF({ ...f, country_code: e.target.value })} />
      <Input label={t('pf.start')} type="time" value={f.work_start} onChange={(e) => setF({ ...f, work_start: e.target.value })} />
      <Input label={t('pf.end')} type="time" value={f.work_end} onChange={(e) => setF({ ...f, work_end: e.target.value })} />
      <Select label={t('shell.theme')} value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value as Profile['theme'] })} options={(['system', 'dark', 'light'] as const).map((v) => ({ value: v, label: t(`shell.theme.${v}`) }))} />
      <div className="flex items-end"><Button type="submit" loading={save.pending}>{t('pf.save')}</Button></div>
      <div className="md:col-span-2"><InlineError message={save.error} /></div>
    </form>
  );
}

export function NotificationPrefs({ profile }: { profile: Profile }) {
  const router = useRouter();
  const t = useT();
  const save = useAction(async (patch: Partial<Profile>) => unwrap(await requireBrowserClient().from('profiles').update(patch).eq('id', profile.id).select('id')), { success: t('pf.prefs_saved') });
  return (
    <div className="flex flex-col gap-4">
      <Switch label={t('pf.email')} description={t('pf.email_desc')} checked={profile.email_notifications} onChange={async (v) => { if (await save.run({ email_notifications: v })) router.refresh(); }} />
      <Switch label={t('pf.reminder')} description={t('pf.reminder_desc')} checked={profile.checkin_reminders} onChange={async (v) => { if (await save.run({ checkin_reminders: v })) router.refresh(); }} />
      <Switch label={t('pf.product_emails')} description={t('pf.product_emails_desc')} checked={profile.product_emails !== false} onChange={async (v) => { if (await save.run({ product_emails: v })) router.refresh(); }} />
      <InlineError message={save.error} />
    </div>
  );
}

interface Factor { id: string; friendly_name?: string; status: string; created_at: string }
interface Passkey { id: string; label: string; created_at: string }

export function SecurityPanel({ passkeys, aal }: { passkeys: Passkey[]; aal: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorErr, setFactorErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  useEffect(() => {
    requireBrowserClient().auth.mfa.listFactors().then(({ data, error }) => {
      if (error) setFactorErr(error.message); else setFactors((data?.totp ?? []) as Factor[]);
    }).catch((e) => setFactorErr(errorMessage(e)));
  }, []);
  const changePw = useAction(async () => { const { error } = await requireBrowserClient().auth.updateUser({ password: pw.a }); if (error) throw error; }, { success: t('pf.pw_changed') });
  const removeFactor = useAction(async (id: string) => { const { error } = await requireBrowserClient().auth.mfa.unenroll({ factorId: id }); if (error) throw error; setFactors((f) => (f ?? []).filter((x) => x.id !== id)); }, { success: t('pf.factor_removed') });
  const addPasskey = useAction(async () => {
    const o = await postJson<{ challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/api/auth/passkey/register/options');
    const { startRegistration } = await import('@simplewebauthn/browser'); // loaded only when a passkey is used
    const att = await startRegistration({ optionsJSON: o.options });
    await postJson('/api/auth/passkey/register/verify', { challengeId: o.challengeId, response: att, label: navigator.platform ? `${t('pf.passkey')} (${navigator.platform})` : t('pf.passkey') });
  }, { success: t('pf.passkey_added') });
  async function removePasskey(id: string) {
    const { error } = await requireBrowserClient().from('passkeys').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else { toast(t('pf.passkey_removed')); router.refresh(); }
  }
  const verified = (factors ?? []).filter((f) => f.status === 'verified');
  return (
    <div className="flex flex-col gap-6">
      <div id="mfa">
        <h3 className="text-label-md">{t('pf.mfa')}</h3>
        {factorErr && <InlineError message={t('pf.factors_failed', { error: factorErr })} />}
        {factors === null && !factorErr ? <p className="text-body-sm text-on-surface-variant">{t('pf.loading')}</p> : verified.length === 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3"><p className="text-body-sm text-on-surface-variant">{t('pf.not_set')}</p><Link href="/mfa?next=/profile" className="text-label-sm text-primary hover:underline">{t('pf.setup_mfa')}</Link></div>
        ) : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {verified.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-body-md">
                <span>{f.friendly_name || t('pf.authenticator')} <span className="text-body-sm text-on-surface-variant">· {t('pf.added')} <TimeAgo date={f.created_at} /></span></span>
                <Button size="sm" variant="ghost" disabled={aal !== 'aal2'} title={aal !== 'aal2' ? t('pf.verify_first') : undefined} loading={removeFactor.pending} onClick={() => removeFactor.run(f.id)}>{t('pf.remove')}</Button>
              </li>
            ))}
          </ul>
        )}
        {verified.length > 0 && aal !== 'aal2' && <p className="mt-1 text-body-sm text-on-surface-variant">{t('pf.not_verified')} <Link href="/mfa?next=/profile" className="text-primary underline">{t('pf.verify')}</Link></p>}
      </div>
      <div>
        <h3 className="text-label-md">{t('pf.passkeys')}</h3>
        {passkeys.length === 0 ? <EmptyState className="mt-2" icon="fingerprint" title={t('pf.no_passkeys')} body={t('pf.no_passkeys_body')} /> : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-body-md">
                <span>{p.label} <span className="text-body-sm text-on-surface-variant">· {t('pf.added')} <TimeAgo date={p.created_at} /></span></span>
                <Button size="sm" variant="ghost" onClick={() => removePasskey(p.id)}>{t('pf.remove')}</Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-2" size="sm" variant="secondary" icon="add" loading={addPasskey.pending} onClick={async () => { if ((await addPasskey.run()) !== undefined) router.refresh(); }}>{t('pf.add_passkey')}</Button>
      </div>
      <form className="grid gap-3 md:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault(); setPwErr(null);
        if (pw.a.length < 10) return setPwErr(t('pf.pw_short'));
        if (pw.a !== pw.b) return setPwErr(t('pf.pw_mismatch'));
        if (await changePw.run() !== undefined) setPw({ a: '', b: '' });
      }}>
        <Input label={t('pf.pw_new')} type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
        <Input label={t('pf.pw_confirm')} type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
        <div className="flex items-end"><Button type="submit" variant="secondary" loading={changePw.pending}>{t('pf.pw_change')}</Button></div>
        <div className="md:col-span-3"><InlineError message={pwErr ?? changePw.error} /></div>
      </form>
      {aal === 'aal2' && <Banner tone="info">{t('pf.verified')}</Banner>}
    </div>
  );
}

/** Per-browser choice of date/number conventions (cookie), e.g. an American working from Nairobi. */
export function RegionFormat({ saved }: { saved: string }) {
  const fmt = useFormat();
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(saved);
  const sample = (l: string) => `${formatDate('2026-10-08', 'short', l)} · ${formatMoney(123450, 'USD', { locale: l })}`;
  return (
    <div className="flex flex-col gap-3">
      <Select label={t('pf.region')} value={value} onChange={(e) => { setValue(e.target.value); setLocaleCookie(e.target.value); router.refresh(); }}
        options={REGION_OPTIONS.map((o) => ({ value: o.value, label: o.value ? `${o.label} — ${sample(o.value)}` : t('pf.region_auto') }))}
        hint={t('pf.region_hint', { sample: sample(fmt.locale) })} />
    </div>
  );
}

/** Data saver: no live updates until asked, initials instead of photos. */
export function DataSaverToggle({ userId, enabled }: { userId: string; enabled: boolean }) {
  const router = useRouter();
  const t = useT();
  const save = useAction(async (v: boolean) => unwrap(await requireBrowserClient().from('profiles').update({ data_saver: v }).eq('id', userId).select('id')), { success: t('profile.saved') });
  return (
    <div className="flex flex-col gap-3">
      <Switch label={t('ds.label')} description={t('ds.desc')} checked={enabled} onChange={async (v) => { if (await save.run(v)) router.refresh(); }} />
      <p className="text-body-sm text-on-surface-variant">{t('ds.install')}</p>
      <InlineError message={save.error} />
    </div>
  );
}
