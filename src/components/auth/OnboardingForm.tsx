'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Select, InlineError, Icon } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage, postJson } from '@/hooks/useAction';
import { CURRENCIES, CURRENCY_NAMES, type Currency } from '@/lib/format';
import { currencyForLocale } from '@/lib/locale';
import { useT } from '@/i18n/client';

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function zones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch { /* old browser */ }
  return ['Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'];
}

export function OnboardingForm({ userId, defaultName, hasWorkspaces }: { userId: string; defaultName: string; hasWorkspaces: boolean }) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle');
  const [currency, setCurrency] = useState<Currency>('KES');
  const [tz, setTz] = useState('Africa/Nairobi');
  const [ws, setWs] = useState('09:00');
  const [we, setWe] = useState('17:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tzList = useMemo(zones, []);

  useEffect(() => {
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi'); } catch { /* keep default */ }
    // Suggest the currency of the founder's region (US → USD, UK → GBP, euro area → EUR); Kenya and unknown stay KES.
    try { setCurrency(currencyForLocale(navigator.language)); } catch { /* keep KES */ }
  }, []);
  useEffect(() => { if (!slugTouched) setSlug(slugify(name)); }, [name, slugTouched]);
  useEffect(() => {
    if (!slug) { setSlugState('idle'); return; }
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) { setSlugState('invalid'); return; }
    setSlugState('checking');
    const t = setTimeout(async () => {
      const supabase = getBrowserClient();
      if (!supabase) return;
      const { data, error: e } = await supabase.rpc('slug_available', { p_slug: slug });
      if (e) { setSlugState('idle'); return; }
      setSlugState(data ? 'free' : 'taken');
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t('onb.err_name'));
    if (slugState === 'taken') return setError(t('onb.err_taken'));
    if (slugState === 'invalid') return setError(t('onb.err_invalid'));
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    try {
      const p = await supabase.from('profiles').update({ timezone: tz, work_start: ws, work_end: we, full_name: defaultName }).eq('id', userId);
      if (p.error) throw p.error;
      const { error: err } = await supabase.rpc('create_organization', { p_name: name.trim(), p_slug: slug, p_currency: currency });
      if (err) throw err;
      await postJson('/api/org/switch', { slug });
      router.replace('/dashboard?welcome=1');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'orbitos.io';
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('onb.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('onb.subtitle')}</p>
      </div>
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <Input label={t('onb.company')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Global" required autoFocus />
        <div>
          <Input label={t('onb.domain')} value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            hint={`${slug || 'your-company'}.${root}`} autoCapitalize="none" spellCheck={false} />
          <p className="mt-1 flex items-center gap-1 text-body-sm" aria-live="polite">
            {slugState === 'checking' && <span className="text-on-surface-variant">{t('onb.checking')}</span>}
            {slugState === 'free' && <span className="flex items-center gap-1 text-healthy"><Icon name="check_circle" className="text-[16px]" />{t('onb.available')}</span>}
            {slugState === 'taken' && <span className="text-alert">{t('onb.taken')}</span>}
            {slugState === 'invalid' && <span className="text-alert">{t('onb.invalid')}</span>}
          </p>
        </div>
        <Select label={t('onb.currency')} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
          options={CURRENCIES.map((c) => ({ value: c, label: `${c} — ${CURRENCY_NAMES[c]}` }))} />
        <Select label={t('onb.tz')} value={tz} onChange={(e) => setTz(e.target.value)} options={tzList.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('onb.start')} type="time" value={ws} onChange={(e) => setWs(e.target.value)} />
          <Input label={t('onb.end')} type="time" value={we} onChange={(e) => setWe(e.target.value)} />
        </div>
        <InlineError message={error} />
        <Button type="submit" loading={busy} disabled={slugState === 'checking'}>{t('onb.create')}</Button>
      </form>
      {hasWorkspaces && <p className="text-center"><Link href="/dashboard" className="text-primary hover:underline">{t('onb.back')}</Link></p>}
    </div>
  );
}
