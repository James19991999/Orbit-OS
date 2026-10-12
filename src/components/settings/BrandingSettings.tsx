'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Icon, Input, InlineError, useToast, cn } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage, postJson } from '@/hooks/useAction';
import { BRAND_PRESETS, brandShades } from '@/lib/brand';
import { useT } from '@/i18n/client';

const TYPES: Record<string, 'png' | 'jpg' | 'webp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX = 1024 * 1024;
const rgb = (c: number[]) => `rgb(${c.join(' ')})`;

/** Owner: workspace logo and accent colour. Everyone else sees what's set. */
export function BrandingSettings({ orgId, orgName, color, logoUrl, canEdit }:
  { orgId: string; orgName: string; color: string | null; logoUrl: string | null; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState(color ?? '');
  const [logo, setLogo] = useState(logoUrl);
  const [busy, setBusy] = useState<null | 'logo' | 'remove' | 'color'>(null);
  const [error, setError] = useState<string | null>(null);
  const clean = hex.trim().toLowerCase();
  const valid = clean === '' || /^#[0-9a-f]{6}$/.test(clean);
  const shades = useMemo(() => brandShades(valid && clean ? clean : '#2563eb'), [clean, valid]);

  const upload = async (f: File) => {
    setError(null);
    const ext = TYPES[f.type];
    if (!ext) { setError(t('brand.bad_type')); return; }
    if (f.size > MAX) { setError(t('brand.too_big')); return; }
    setBusy('logo');
    const path = `${orgId}/logo-${Date.now()}.${ext}`;
    const storage = requireBrowserClient().storage.from('branding');
    try {
      const { error: upErr } = await storage.upload(path, f, { contentType: f.type, cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;
      try {
        await postJson('/api/settings/branding', { logoPath: path }, 'PATCH');
      } catch (e) {
        await storage.remove([path]);   // don't leave an orphaned file
        throw e;
      }
      setLogo(storage.getPublicUrl(path).data.publicUrl);
      toast(t('brand.saved'), 'success');
      router.refresh();
    } catch (e) { setError(errorMessage(e)); } finally {
      setBusy(null);
      if (file.current) file.current.value = '';
    }
  };

  const save = async (patch: { color?: string | null; logoPath?: null }, which: 'remove' | 'color') => {
    setError(null);
    setBusy(which);
    try {
      await postJson('/api/settings/branding', patch, 'PATCH');
      if (patch.logoPath === null) setLogo(null);
      toast(t('brand.saved'), 'success');
      router.refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-md text-on-surface-variant">{t('brand.sub')}</p>
      {!canEdit && <p className="flex items-center gap-2 text-body-sm text-on-surface-variant"><Icon name="lock" />{t('brand.owner_only')}</p>}

      <div>
        <h3 className="mb-2 text-label-md">{t('brand.logo')}</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
            {logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logo} alt={t('brand.logo_alt', { org: orgName })} className="h-full w-full object-contain" data-testid="brand-logo-preview" />
              : <span className="px-1 text-center text-label-xs text-on-surface-variant">{t('brand.no_logo')}</span>}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="brand-logo-file" aria-label={t('brand.upload')} tabIndex={-1} aria-describedby="brand-logo-hint"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                <Button size="sm" variant="secondary" icon="upload" loading={busy === 'logo'} disabled={!!busy} onClick={() => file.current?.click()}>{t('brand.upload')}</Button>
                {logo && <Button size="sm" variant="ghost" icon="delete" loading={busy === 'remove'} disabled={!!busy} onClick={() => void save({ logoPath: null }, 'remove')}>{t('brand.remove')}</Button>}
              </div>
              <p id="brand-logo-hint" className="text-body-sm text-on-surface-variant">{t('brand.logo_hint')}</p>
            </div>
          )}
        </div>
      </div>

      <fieldset disabled={!canEdit}>
        <legend className="mb-2 text-label-md">{t('brand.color')}</legend>
        <div className="flex flex-wrap gap-2">
          {BRAND_PRESETS.map((c) => (
            <button key={c} type="button" onClick={() => setHex(c)} aria-label={t('brand.preset', { color: c })} aria-pressed={clean === c}
              className={cn('h-9 w-9 rounded-full border-2 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60',
                clean === c ? 'scale-110 border-on-surface' : 'border-transparent')}
              style={{ background: c }} />
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          <Input label={t('brand.custom')} value={hex} placeholder="#2563eb" maxLength={7} spellCheck={false} autoComplete="off"
            onChange={(e) => setHex(e.target.value)} error={valid ? undefined : t('brand.bad_color')} />
        </div>
      </fieldset>

      {shades && (
        <div>
          <h3 className="mb-2 text-label-md">{t('brand.preview')}</h3>
          <div className="grid gap-3 sm:grid-cols-2" data-testid="brand-preview">
            {([['#f8fafc', '#0f172a', shades.lightText], ['#0b1326', '#e2e8f0', shades.darkText]] as const).map(([bg, fg, link]) => (
              <div key={bg} className="flex items-center gap-3 rounded-lg border border-outline-variant p-4" style={{ background: bg, color: fg }}>
                <span className="inline-flex h-9 items-center rounded px-4 text-label-md" style={{ background: rgb(shades.container), color: '#fff' }}>{t('brand.button')}</span>
                <span className="text-label-md underline" style={{ color: rgb(link) }}>{t('brand.link')}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-body-sm text-on-surface-variant">{t('brand.adjusted')}</p>
        </div>
      )}

      {error && <InlineError message={error} />}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button icon="palette" loading={busy === 'color'} disabled={!!busy || !valid || (clean || null) === (color ?? null)}
            onClick={() => void save({ color: clean || null }, 'color')}>{t('brand.save')}</Button>
          {color && <Button variant="ghost" disabled={!!busy} onClick={() => { setHex(''); void save({ color: null }, 'color'); }}>{t('brand.reset')}</Button>}
        </div>
      )}
    </div>
  );
}
