'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Switch, InlineError, Dialog, Checkbox, EmptyState, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson, errorMessage } from '@/hooks/useAction';
import type { LegalEntity, Organization } from '@/lib/types';
import { useFormat } from '@/lib/locale/client';
import { CURRENCIES, CURRENCY_NAMES, type Currency } from '@/lib/format';

export function OrgForm({ org, canEdit }: { org: Pick<Organization, 'id' | 'name' | 'legal_name' | 'currency' | 'expense_approval_threshold_minor' | 'hourly_cost_minor'>; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ name: org.name, legal_name: org.legal_name ?? '', currency: org.currency, threshold: String(Number(org.expense_approval_threshold_minor) / 100), hourly: String(Number(org.hourly_cost_minor) / 100) });
  const save = useAction(async () => unwrap(await requireBrowserClient().from('organizations').update({
    name: f.name.trim(), legal_name: f.legal_name.trim() || null, currency: f.currency,
    expense_approval_threshold_minor: Math.round(Number(f.threshold) * 100), hourly_cost_minor: Math.round(Number(f.hourly) * 100),
  }).eq('id', org.id).select('id')), { success: 'Organization saved' });
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await save.run()) router.refresh(); }}>
      <Input label="Display name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!canEdit} />
      <Input label="Legal name" value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} disabled={!canEdit} />
      <Select label="Reporting currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} disabled={!canEdit}
        options={CURRENCIES.map((c) => ({ value: c, label: `${c} — ${CURRENCY_NAMES[c]}` }))} hint="Finance metrics only count entries in this currency." />
      <Input label={`Expense approval threshold (${f.currency})`} inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} disabled={!canEdit} />
      <Input label={`Cost per person-hour (${f.currency})`} inputMode="decimal" value={f.hourly} onChange={(e) => setF({ ...f, hourly: e.target.value })} disabled={!canEdit} hint="Used to value meeting time in Reports." />
      {canEdit && <div className="flex items-end"><Button type="submit" loading={save.pending}>Save</Button></div>}
      <div className="md:col-span-2"><InlineError message={save.error} /></div>
    </form>
  );
}

export function LegalEntities({ orgId, items, canEdit }: { orgId: string; items: LegalEntity[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', jurisdiction: '', entity_type: '', hub_label: '', is_primary: false });
  const add = useAction(async () => {
    const sb = requireBrowserClient();
    if (f.is_primary) unwrap(await sb.from('legal_entities').update({ is_primary: false }).eq('org_id', orgId).select('id'));
    return unwrap(await sb.from('legal_entities').insert({ org_id: orgId, ...f, entity_type: f.entity_type || null, hub_label: f.hub_label || null }).select('id'));
  }, { success: 'Entity added' });
  async function remove(id: string) {
    const { error } = await requireBrowserClient().from('legal_entities').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else router.refresh();
  }
  return (
    <div>
      {items.length === 0 ? <EmptyState icon="apartment" title="No legal entities" /> : (
        <ul className="divide-y divide-outline-variant">
          {items.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-label-md">{e.name} {e.is_primary && <span className="ml-1 rounded-full bg-primary-container/15 px-2 py-0.5 text-label-xs text-primary">PRIMARY</span>}</p>
                <p className="text-body-sm text-on-surface-variant">{[e.jurisdiction, e.entity_type, e.hub_label].filter(Boolean).join(' · ')}</p>
              </div>
              {canEdit && <Button size="sm" variant="ghost" icon="delete" aria-label={`Remove ${e.name}`} onClick={() => remove(e.id)} />}
            </li>
          ))}
        </ul>
      )}
      {canEdit && <Button className="mt-2" size="sm" variant="ghost" icon="add" onClick={() => setOpen(true)}>Add entity</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add legal entity"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={add.pending} disabled={!f.name.trim() || !f.jurisdiction.trim()} onClick={async () => { if (await add.run()) { setOpen(false); router.refresh(); } }}>Add</Button></>}>
        <div className="grid gap-3">
          <Input label="Registered name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Jurisdiction" placeholder="Kenya, Delaware, United Kingdom…" value={f.jurisdiction} onChange={(e) => setF({ ...f, jurisdiction: e.target.value })} />
          <Input label="Entity type" placeholder="Private Limited Company" value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value })} />
          <Input label="Hub label" placeholder="Nairobi HQ" value={f.hub_label} onChange={(e) => setF({ ...f, hub_label: e.target.value })} />
          <Checkbox label="Primary entity (parent / HQ)" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} />
          <InlineError message={add.error} />
        </div>
      </Dialog>
    </div>
  );
}

export function AuthSettings({ org, isOwner, ssoAllowed }: { org: Pick<Organization, 'enforce_mfa_admins' | 'session_timeout_hours' | 'sso_domain' | 'slug' | 'audit_retention_years'>; isOwner: boolean; ssoAllowed: boolean }) {
  const router = useRouter();
  const [sso, setSso] = useState(org.sso_domain ?? '');
  const save = useAction(async (patch: Record<string, unknown>) => postJson('/api/settings/auth', patch, 'PATCH'), { success: 'Security settings saved' });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-label-md">SAML single sign-on (Okta, Entra ID, Google)</p>
        <p className="text-body-sm text-on-surface-variant">{org.sso_domain ? <>Active for <strong>@{org.sso_domain}</strong>. Members choose “Continue with Okta / SAML” after entering <code>{org.slug}</code>.</> : 'Not configured.'}</p>
        {isOwner && ssoAllowed && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await save.run({ sso_domain: sso.trim() || null })) router.refresh(); }}>
            <Input label="Email domain registered with your IdP" placeholder="company.com" value={sso} onChange={(e) => setSso(e.target.value)} />
            <Button type="submit" variant="secondary" loading={save.pending}>Save</Button>
          </form>
        )}
        {!ssoAllowed && <p className="mt-1 text-body-sm text-on-surface-variant">SAML SSO is included on Enterprise.</p>}
        <details className="mt-2 text-body-sm text-on-surface-variant">
          <summary className="cursor-pointer text-primary">How to connect your identity provider</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>SAML on Supabase needs the Pro plan or higher (Auth → Providers → enable SAML 2.0).</li>
            <li>Register your IdP: <code className="break-all">supabase sso add --type saml --project-ref &lt;ref&gt; --metadata-url &lt;IdP metadata URL&gt; --domains {org.sso_domain || 'company.com'}</code></li>
            <li>Save the same domain above.</li>
          </ol>
        </details>
      </div>
      <Switch label="Require two-factor authentication for owners and directors" description="Owners and directors without an authenticator app are asked to set one up before they can continue."
        checked={org.enforce_mfa_admins} disabled={!isOwner || save.pending} onChange={async (v) => { if (await save.run({ enforce_mfa_admins: v })) router.refresh(); }} />
      <Select label="Session inactivity timeout" value={String(org.session_timeout_hours)} disabled={!isOwner || save.pending}
        onChange={async (e) => { if (await save.run({ session_timeout_hours: Number(e.target.value) })) router.refresh(); }}
        options={[1, 4, 8, 12, 24].map((h) => ({ value: String(h), label: `${h} hour${h === 1 ? '' : 's'}` }))} hint="Members are signed out after this long without activity." />
      <Select label="Keep the audit log for" value={String(org.audit_retention_years)} disabled={!isOwner || save.pending}
        onChange={async (e) => { if (await save.run({ audit_retention_years: Number(e.target.value) })) router.refresh(); }}
        options={[1, 2, 3, 5, 7, 10].map((y) => ({ value: String(y), label: `${y} year${y === 1 ? '' : 's'}` }))} hint="Older entries are deleted by the daily clean-up. Entries can never be edited." />
      <InlineError message={save.error} />
    </div>
  );
}

/** Owner-facing: notify owners when 95% of seats are in use (checked daily). */
export function SeatAlertToggle({ orgId, enabled, canEdit }: { orgId: string; enabled: boolean; canEdit: boolean }) {
  const router = useRouter();
  const save = useAction(async (v: boolean) => unwrap(await requireBrowserClient().from('organizations').update({ seat_autoscale: v }).eq('id', orgId).select('id')), { success: 'Saved' });
  return (
    <div className="flex flex-col gap-2">
      <Switch label="Alert me at 95% of seats" description="Owners get a notification when the workspace is almost full, so you can add seats before anyone is blocked." checked={enabled} disabled={!canEdit || save.pending}
        onChange={async (v) => { if (await save.run(v)) router.refresh(); }} />
      <InlineError message={save.error} />
    </div>
  );
}

export function TimezoneEngine({ org, canEdit }: { org: Pick<Organization, 'id' | 'core_window_start' | 'core_window_end' | 'golden_overlap_min_hours' | 'quiet_hours' | 'auto_detect_timezone'>; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ start: org.core_window_start.slice(0, 5), end: org.core_window_end.slice(0, 5), overlap: String(org.golden_overlap_min_hours) });
  const save = useAction(async (patch: Record<string, unknown>) => unwrap(await requireBrowserClient().from('organizations').update(patch).eq('id', org.id).select('id')), { success: 'Time zone settings saved' });
  return (
    <div className="flex flex-col gap-5">
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); if (await save.run({ core_window_start: f.start, core_window_end: f.end, golden_overlap_min_hours: Number(f.overlap) })) router.refresh(); }}>
        <Input label="Core window starts (local)" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} disabled={!canEdit} />
        <Input label="Core window ends (local)" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} disabled={!canEdit} />
        <Input label="Overlap window target (hours)" type="number" step="0.5" min={0.5} max={8} value={f.overlap} onChange={(e) => setF({ ...f, overlap: e.target.value })} disabled={!canEdit} />
        {canEdit && <div className="flex items-end"><Button type="submit" variant="secondary" loading={save.pending}>Save</Button></div>}
      </form>
      <Switch label="Quiet hours" description="Hold non-urgent emails (renewal reminders) until each recipient's working hours. Check-in reminders are always sent at 16:00 local time." checked={org.quiet_hours} disabled={!canEdit}
        onChange={async (v) => { if (await save.run({ quiet_hours: v })) router.refresh(); }} />
      <Switch label="Auto-detect time zone on sign-in" description="Offer to update a member's time zone when their device reports a different one (e.g. when travelling)." checked={org.auto_detect_timezone} disabled={!canEdit}
        onChange={async (v) => { if (await save.run({ auto_detect_timezone: v })) router.refresh(); }} />
      <InlineError message={save.error} />
    </div>
  );
}

export function GovernanceActions({ slug, isOwner, archiveAllowed, offboarding, deletionAt, aal2 }: { slug: string; isOwner: boolean; archiveAllowed: boolean; offboarding: boolean; deletionAt: string | null; aal2: boolean }) {
  const fmt = useFormat();
  const router = useRouter();
  const { toast } = useToast();
  const [archiving, setArchiving] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const off = useAction(async () => postJson('/api/org/offboarding', { confirm }));
  const cancel = useAction(async () => postJson('/api/org/offboarding', undefined, 'DELETE'), { success: 'Offboarding cancelled' });
  async function archive() {
    setArchiving(true);
    try {
      const res = await fetch('/api/org/archive', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${slug}-archive.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Archive downloaded');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setArchiving(false); }
  }
  if (!isOwner) return <p className="text-body-sm text-on-surface-variant">Only owners can export or offboard the workspace.</p>;
  return (
    <div className="flex flex-col gap-3">
      {!aal2 && <p className="text-body-sm text-warning">Archive and offboarding require a two-factor verified session. <a className="underline" href="/mfa?next=/settings%23data">Verify now</a></p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="cloud_download" onClick={archive} loading={archiving} disabled={!archiveAllowed || !aal2}>Request full tenant archive (.zip)</Button>
        {offboarding
          ? <Button variant="secondary" icon="undo" onClick={async () => { if (await cancel.run()) router.refresh(); }} loading={cancel.pending}>Cancel offboarding</Button>
          : <Button variant="danger" icon="lock_reset" onClick={() => setOpen(true)} disabled={!aal2}>Close workspace</Button>}
      </div>
      {!archiveAllowed && <p className="text-body-sm text-on-surface-variant">Full archives are included on Enterprise.</p>}
      {offboarding && deletionAt && <p className="text-body-sm text-alert">This workspace is read-only and will be permanently deleted on {fmt.date(deletionAt, 'long')}.</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Offboard this workspace?" description="It becomes read-only now and is permanently deleted after 30 days. You can cancel until then."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Keep workspace</Button><Button variant="danger" disabled={confirm !== slug} loading={off.pending} onClick={async () => { if (await off.run()) { setOpen(false); router.refresh(); } }}>Offboard workspace</Button></>}>
        <Input label={`Type “${slug}” to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        <InlineError message={off.error} />
      </Dialog>
    </div>
  );
}
