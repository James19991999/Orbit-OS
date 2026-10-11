'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Switch, InlineError, Dialog, Checkbox, EmptyState, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson, errorMessage } from '@/hooks/useAction';
import type { LegalEntity, Organization } from '@/lib/types';
import { useFormat } from '@/lib/locale/client';
import { CURRENCIES, CURRENCY_NAMES, type Currency } from '@/lib/format';
import { useT } from '@/i18n/client';

export function OrgForm({ org, canEdit }: { org: Pick<Organization, 'id' | 'name' | 'legal_name' | 'currency' | 'expense_approval_threshold_minor' | 'hourly_cost_minor'>; canEdit: boolean }) {
  const router = useRouter();
  const t = useT();
  const [f, setF] = useState({ name: org.name, legal_name: org.legal_name ?? '', currency: org.currency, threshold: String(Number(org.expense_approval_threshold_minor) / 100), hourly: String(Number(org.hourly_cost_minor) / 100) });
  const save = useAction(async () => unwrap(await requireBrowserClient().from('organizations').update({
    name: f.name.trim(), legal_name: f.legal_name.trim() || null, currency: f.currency,
    expense_approval_threshold_minor: Math.round(Number(f.threshold) * 100), hourly_cost_minor: Math.round(Number(f.hourly) * 100),
  }).eq('id', org.id).select('id')), { success: t('org.saved') });
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await save.run()) router.refresh(); }}>
      <Input label={t('org.display')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!canEdit} />
      <Input label={t('org.legal')} value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} disabled={!canEdit} />
      <Select label={t('org.currency')} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} disabled={!canEdit}
        options={CURRENCIES.map((c) => ({ value: c, label: `${c} — ${CURRENCY_NAMES[c]}` }))} hint={t('org.currency_hint')} />
      <Input label={t('org.threshold', { currency: f.currency })} inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} disabled={!canEdit} />
      <Input label={t('org.hourly', { currency: f.currency })} inputMode="decimal" value={f.hourly} onChange={(e) => setF({ ...f, hourly: e.target.value })} disabled={!canEdit} hint={t('org.hourly_hint')} />
      {canEdit && <div className="flex items-end"><Button type="submit" loading={save.pending}>{t('set.save')}</Button></div>}
      <div className="md:col-span-2"><InlineError message={save.error} /></div>
    </form>
  );
}

export function LegalEntities({ orgId, items, canEdit }: { orgId: string; items: LegalEntity[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', jurisdiction: '', entity_type: '', hub_label: '', is_primary: false });
  const add = useAction(async () => {
    const sb = requireBrowserClient();
    if (f.is_primary) unwrap(await sb.from('legal_entities').update({ is_primary: false }).eq('org_id', orgId).select('id'));
    return unwrap(await sb.from('legal_entities').insert({ org_id: orgId, ...f, entity_type: f.entity_type || null, hub_label: f.hub_label || null }).select('id'));
  }, { success: t('ent.added') });
  async function remove(id: string) {
    const { error } = await requireBrowserClient().from('legal_entities').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else router.refresh();
  }
  return (
    <div>
      {items.length === 0 ? <EmptyState icon="apartment" title={t('ent.none')} /> : (
        <ul className="divide-y divide-outline-variant">
          {items.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-label-md">{e.name} {e.is_primary && <span className="ml-1 rounded-full bg-primary-container/15 px-2 py-0.5 text-label-xs text-primary">{t('ent.primary')}</span>}</p>
                <p className="text-body-sm text-on-surface-variant">{[e.jurisdiction, e.entity_type, e.hub_label].filter(Boolean).join(' · ')}</p>
              </div>
              {canEdit && <Button size="sm" variant="ghost" icon="delete" aria-label={t('ent.remove', { name: e.name })} onClick={() => remove(e.id)} />}
            </li>
          ))}
        </ul>
      )}
      {canEdit && <Button className="mt-2" size="sm" variant="ghost" icon="add" onClick={() => setOpen(true)}>{t('ent.add')}</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('ent.title')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('set.cancel')}</Button><Button loading={add.pending} disabled={!f.name.trim() || !f.jurisdiction.trim()} onClick={async () => { if (await add.run()) { setOpen(false); router.refresh(); } }}>{t('set.add')}</Button></>}>
        <div className="grid gap-3">
          <Input label={t('ent.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label={t('ent.jur')} placeholder={t('ent.jur_ph')} value={f.jurisdiction} onChange={(e) => setF({ ...f, jurisdiction: e.target.value })} />
          <Input label={t('ent.type')} placeholder={t('ent.type_ph')} value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value })} />
          <Input label={t('ent.hub')} placeholder={t('ent.hub_ph')} value={f.hub_label} onChange={(e) => setF({ ...f, hub_label: e.target.value })} />
          <Checkbox label={t('ent.is_primary')} checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} />
          <InlineError message={add.error} />
        </div>
      </Dialog>
    </div>
  );
}

export function AuthSettings({ org, isOwner, ssoAllowed }: { org: Pick<Organization, 'enforce_mfa_admins' | 'session_timeout_hours' | 'sso_domain' | 'slug' | 'audit_retention_years'>; isOwner: boolean; ssoAllowed: boolean }) {
  const router = useRouter();
  const t = useT();
  const [sso, setSso] = useState(org.sso_domain ?? '');
  const save = useAction(async (patch: Record<string, unknown>) => postJson('/api/settings/auth', patch, 'PATCH'), { success: t('auth.saved') });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-label-md">{t('auth.sso')}</p>
        <p className="text-body-sm text-on-surface-variant">{org.sso_domain ? t('auth.sso_active', { domain: `@${org.sso_domain}`, slug: org.slug }) : t('auth.sso_off')}</p>
        {isOwner && ssoAllowed && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await save.run({ sso_domain: sso.trim() || null })) router.refresh(); }}>
            <Input label={t('auth.sso_domain')} placeholder="company.com" value={sso} onChange={(e) => setSso(e.target.value)} />
            <Button type="submit" variant="secondary" loading={save.pending}>{t('set.save')}</Button>
          </form>
        )}
        {!ssoAllowed && <p className="mt-1 text-body-sm text-on-surface-variant">{t('auth.sso_plan')}</p>}
        <details className="mt-2 text-body-sm text-on-surface-variant">
          <summary className="cursor-pointer text-primary">{t('auth.howto')}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>{t('auth.step1')}</li>
            <li>{t('auth.step2')} <code className="break-all">supabase sso add --type saml --project-ref &lt;ref&gt; --metadata-url &lt;IdP metadata URL&gt; --domains {org.sso_domain || 'company.com'}</code></li>
            <li>{t('auth.step3')}</li>
          </ol>
        </details>
      </div>
      <Switch label={t('auth.mfa')} description={t('auth.mfa_desc')}
        checked={org.enforce_mfa_admins} disabled={!isOwner || save.pending} onChange={async (v) => { if (await save.run({ enforce_mfa_admins: v })) router.refresh(); }} />
      <Select label={t('auth.timeout')} value={String(org.session_timeout_hours)} disabled={!isOwner || save.pending}
        onChange={async (e) => { if (await save.run({ session_timeout_hours: Number(e.target.value) })) router.refresh(); }}
        options={[1, 4, 8, 12, 24].map((h) => ({ value: String(h), label: t('auth.hours', { count: h }) }))} hint={t('auth.timeout_hint')} />
      <Select label={t('auth.retention')} value={String(org.audit_retention_years)} disabled={!isOwner || save.pending}
        onChange={async (e) => { if (await save.run({ audit_retention_years: Number(e.target.value) })) router.refresh(); }}
        options={[1, 2, 3, 5, 7, 10].map((y) => ({ value: String(y), label: t('auth.years', { count: y }) }))} hint={t('auth.retention_hint')} />
      <InlineError message={save.error} />
    </div>
  );
}

/** Owner-facing: notify owners when 95% of seats are in use (checked daily). */
export function SeatAlertToggle({ orgId, enabled, canEdit }: { orgId: string; enabled: boolean; canEdit: boolean }) {
  const router = useRouter();
  const t = useT();
  const save = useAction(async (v: boolean) => unwrap(await requireBrowserClient().from('organizations').update({ seat_autoscale: v }).eq('id', orgId).select('id')), { success: t('set.saved') });
  return (
    <div className="flex flex-col gap-2">
      <Switch label={t('seat.label')} description={t('seat.desc')} checked={enabled} disabled={!canEdit || save.pending}
        onChange={async (v) => { if (await save.run(v)) router.refresh(); }} />
      <InlineError message={save.error} />
    </div>
  );
}

export function TimezoneEngine({ org, canEdit }: { org: Pick<Organization, 'id' | 'core_window_start' | 'core_window_end' | 'golden_overlap_min_hours' | 'quiet_hours' | 'auto_detect_timezone'>; canEdit: boolean }) {
  const router = useRouter();
  const t = useT();
  const [f, setF] = useState({ start: org.core_window_start.slice(0, 5), end: org.core_window_end.slice(0, 5), overlap: String(org.golden_overlap_min_hours) });
  const save = useAction(async (patch: Record<string, unknown>) => unwrap(await requireBrowserClient().from('organizations').update(patch).eq('id', org.id).select('id')), { success: t('tz.saved') });
  return (
    <div className="flex flex-col gap-5">
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); if (await save.run({ core_window_start: f.start, core_window_end: f.end, golden_overlap_min_hours: Number(f.overlap) })) router.refresh(); }}>
        <Input label={t('tz.start')} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} disabled={!canEdit} />
        <Input label={t('tz.end')} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} disabled={!canEdit} />
        <Input label={t('tz.overlap')} type="number" step="0.5" min={0.5} max={8} value={f.overlap} onChange={(e) => setF({ ...f, overlap: e.target.value })} disabled={!canEdit} />
        {canEdit && <div className="flex items-end"><Button type="submit" variant="secondary" loading={save.pending}>{t('set.save')}</Button></div>}
      </form>
      <Switch label={t('tz.quiet')} description={t('tz.quiet_desc')} checked={org.quiet_hours} disabled={!canEdit}
        onChange={async (v) => { if (await save.run({ quiet_hours: v })) router.refresh(); }} />
      <Switch label={t('tz.auto')} description={t('tz.auto_desc')} checked={org.auto_detect_timezone} disabled={!canEdit}
        onChange={async (v) => { if (await save.run({ auto_detect_timezone: v })) router.refresh(); }} />
      <InlineError message={save.error} />
    </div>
  );
}

export function GovernanceActions({ slug, isOwner, archiveAllowed, offboarding, deletionAt, aal2 }: { slug: string; isOwner: boolean; archiveAllowed: boolean; offboarding: boolean; deletionAt: string | null; aal2: boolean }) {
  const fmt = useFormat();
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [archiving, setArchiving] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const off = useAction(async () => postJson('/api/org/offboarding', { confirm }));
  const cancel = useAction(async () => postJson('/api/org/offboarding', undefined, 'DELETE'), { success: t('gov.cancelled') });
  async function archive() {
    setArchiving(true);
    try {
      const res = await fetch('/api/org/archive', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('gov.failed', { status: res.status }));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${slug}-archive.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(t('gov.downloaded'));
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setArchiving(false); }
  }
  if (!isOwner) return <p className="text-body-sm text-on-surface-variant">{t('gov.owner_only')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {!aal2 && <p className="text-body-sm text-warning">{t('gov.mfa')} <a className="underline" href="/mfa?next=/settings%23data">{t('set.verify')}</a></p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="cloud_download" onClick={archive} loading={archiving} disabled={!archiveAllowed || !aal2}>{t('gov.archive')}</Button>
        {offboarding
          ? <Button variant="secondary" icon="undo" onClick={async () => { if (await cancel.run()) router.refresh(); }} loading={cancel.pending}>{t('gov.cancel')}</Button>
          : <Button variant="danger" icon="lock_reset" onClick={() => setOpen(true)} disabled={!aal2}>{t('gov.close')}</Button>}
      </div>
      {!archiveAllowed && <p className="text-body-sm text-on-surface-variant">{t('gov.plan')}</p>}
      {offboarding && deletionAt && <p className="text-body-sm text-alert">{t('gov.deleting', { date: fmt.date(deletionAt, 'long') })}</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('gov.title')} description={t('gov.desc')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('gov.keep')}</Button><Button variant="danger" disabled={confirm !== slug} loading={off.pending} onClick={async () => { if (await off.run()) { setOpen(false); router.refresh(); } }}>{t('gov.go')}</Button></>}>
        <Input label={t('gov.confirm', { slug })} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        <InlineError message={off.error} />
      </Dialog>
    </div>
  );
}
