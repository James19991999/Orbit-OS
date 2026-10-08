'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Select, Textarea, InlineError, Banner, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson, errorMessage } from '@/hooks/useAction';
import { FRAMEWORK_TEMPLATES } from '@/lib/compliance/templates';
import { useFormat } from '@/lib/locale/client';

export function EnableFramework({ orgId, enabledKeys, limit }: { orgId: string; enabledKeys: string[]; limit: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [target, setTarget] = useState('');
  const available = FRAMEWORK_TEMPLATES.filter((t) => !enabledKeys.includes(t.key));
  const atLimit = enabledKeys.length >= limit;
  const save = useAction(async () => {
    const t = FRAMEWORK_TEMPLATES.find((x) => x.key === key)!;
    const sb = requireBrowserClient();
    const fw = unwrap(await sb.from('compliance_frameworks').insert({ org_id: orgId, key: t.key, name: t.name, description: t.description, target_date: target || null, policy_version: '1.0' }).select('id').single()) as { id: string };
    unwrap(await sb.from('compliance_controls').insert(t.controls.map(([ref, title]) => ({ org_id: orgId, framework_id: fw.id, ref, title, status: 'not_started' }))).select('id'));
    return fw;
  }, { success: 'Framework enabled' });
  if (!available.length) return null;
  return (
    <>
      <Button size="sm" variant="secondary" icon="add" onClick={() => setOpen(true)}>Enable framework</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Enable a framework" description="Adds a starter set of controls you can track, assign and attach evidence to."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!key || atLimit} loading={save.pending} onClick={async () => { if (await save.run()) { setOpen(false); router.refresh(); } }}>Enable</Button></>}>
        {atLimit ? <Banner tone="warning">Your plan includes {limit} framework{limit === 1 ? '' : 's'}. Upgrade in Settings → Billing to add more.</Banner> : (
          <div className="grid gap-4">
            <Select label="Framework" value={key} onChange={(e) => setKey(e.target.value)} options={[{ value: '', label: 'Choose…' }, ...available.map((t) => ({ value: t.key, label: `${t.name} (${t.controls.length} controls)` }))]} />
            <Input label="Target audit date (optional)" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            <InlineError message={save.error} />
          </div>
        )}
      </Dialog>
    </>
  );
}

export function DsarTracker({ orgId, items, canManage }: { orgId: string; items: { id: string; requester_email: string; type: string; status: string; due_on: string }[]; canManage: boolean }) {
  const fmt = useFormat();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', type: 'access' });
  const add = useAction(async () => unwrap(await requireBrowserClient().from('dsar_requests').insert({ org_id: orgId, requester_email: f.email.trim(), type: f.type }).select('id')), { success: 'Request logged — due in 30 days' });
  async function setStatus(id: string, status: string) {
    const { error } = await requireBrowserClient().from('dsar_requests').update({ status }).eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else { toast('Request updated'); router.refresh(); }
  }
  const open_ = items.filter((d) => d.status !== 'closed');
  return (
    <div id="dsar">
      <p className="text-body-md"><strong className="tnum">{open_.length}</strong> data subject requests open</p>
      <ul className="mt-2 divide-y divide-outline-variant text-body-sm">
        {items.slice(0, 5).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="capitalize">{d.type}</span> · {d.requester_email} · due {fmt.date(d.due_on)}</span>
            {canManage ? (
              <select aria-label={`Status for ${d.requester_email}`} value={d.status} onChange={(e) => setStatus(d.id, e.target.value)} className="h-8 rounded border border-outline-variant bg-surface-container-lowest px-2">
                <option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option>
              </select>
            ) : <span className="capitalize">{d.status.replace('_', ' ')}</span>}
          </li>
        ))}
      </ul>
      {canManage && <Button className="mt-2" size="sm" variant="ghost" icon="add" onClick={() => setOpen(true)}>Log request</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Log a data subject request"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={add.pending} onClick={async () => { if (!/^\S+@\S+\.\S+$/.test(f.email)) { toast('Enter the requester email', 'error'); return; } if (await add.run()) { setOpen(false); router.refresh(); } }}>Save</Button></>}>
        <div className="grid gap-4">
          <Input label="Requester email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Select label="Request type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={['access', 'erasure', 'rectification', 'portability'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
        </div>
      </Dialog>
    </div>
  );
}

/** Parses "name,os,owner_email,encrypted(yes/no),agent(yes/no)" device CSV. Exported for tests. */
export function parseDevicesCsv(text: string, emails: Record<string, string>) {
  const rows: { name: string; os: string; owner_id: string | null; encrypted: boolean; agent_installed: boolean }[] = [];
  const errors: string[] = [];
  const yes = (v?: string) => /^(y|yes|true|1)$/i.test((v ?? '').trim());
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const c = line.split(',').map((x) => x.trim());
    if (i === 0 && /^name$/i.test(c[0] ?? '')) return;
    if (!c[0]) { errors.push(`Line ${i + 1}: device name is required`); return; }
    rows.push({ name: c[0], os: c[1] || 'Unknown', owner_id: c[2] ? emails[c[2].toLowerCase()] ?? null : null, encrypted: yes(c[3]), agent_installed: yes(c[4]) });
  });
  return { rows, errors };
}

export function DeviceActions({ orgId, people }: { orgId: string; people: { id: string; name: string; email: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const emails = Object.fromEntries(people.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p.id]));
  const save = useAction(async (rows: unknown[]) => unwrap(await requireBrowserClient().from('devices').insert(rows).select('id')), { success: 'Devices imported' });
  return (
    <>
      <Button size="sm" variant="secondary" icon="upload" onClick={() => setOpen(true)}>Import devices</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Import devices (CSV)"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={save.pending} onClick={async () => {
          const p = parseDevicesCsv(csv, emails);
          if (p.errors.length) return setErr(p.errors.slice(0, 3).join(' · '));
          if (!p.rows.length) return setErr('Paste at least one device.');
          setErr(null);
          if (await save.run(p.rows.map((r) => ({ ...r, org_id: orgId, last_seen_on: new Date().toISOString().slice(0, 10) })))) { setOpen(false); setCsv(''); router.refresh(); }
        }}>Import</Button></>}>
        <Textarea label="CSV" rows={6} className="font-mono" value={csv} onChange={(e) => setCsv(e.target.value)} hint="name,os,owner_email,encrypted,agent — e.g. MacBook Pro,macOS,ana@company.com,yes,yes" />
        <InlineError message={err ?? save.error} />
      </Dialog>
    </>
  );
}

export function TrainingActions({ campaignId, remaining, canManage, myAssignment, orgId, members }:
  { campaignId: string | null; remaining: number; canManage: boolean; myAssignment: { completed_at: string | null } | null; orgId: string; members: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', due: '' });
  const remind = useAction(async () => postJson<{ emailed: number; skipped: number; notConfigured: boolean }>('/api/compliance/training/remind', { campaignId }));
  const complete = useAction(async () => {
    const sb = requireBrowserClient();
    const uid = (await sb.auth.getUser()).data.user!.id;
    return unwrap(await sb.from('training_assignments').update({ completed_at: new Date().toISOString() }).eq('campaign_id', campaignId!).eq('user_id', uid).select('user_id'));
  }, { success: 'Training marked complete' });
  const create = useAction(async () => {
    const sb = requireBrowserClient();
    const c = unwrap(await sb.from('training_campaigns').insert({ org_id: orgId, title: f.title.trim(), due_on: f.due }).select('id').single()) as { id: string };
    unwrap(await sb.from('training_assignments').insert(members.map((u) => ({ campaign_id: c.id, org_id: orgId, user_id: u }))).select('user_id'));
    return c;
  }, { success: 'Campaign assigned to everyone' });
  return (
    <div className="flex flex-wrap gap-2">
      {campaignId && myAssignment && !myAssignment.completed_at && <Button size="sm" icon="task_alt" loading={complete.pending} onClick={async () => { if (await complete.run()) router.refresh(); }}>I completed this training</Button>}
      {campaignId && canManage && remaining > 0 && (
        <Button size="sm" variant="secondary" icon="forward_to_inbox" loading={remind.pending} onClick={async () => {
          const r = await remind.run();
          if (r) toast(r.notConfigured ? 'Email is not configured — reminders could not be sent.' : `Reminded ${r.emailed}${r.skipped ? ` (${r.skipped} already reminded in the last 24h)` : ''}`, r.notConfigured ? 'error' : 'success');
        }}>Remind remaining {remaining}</Button>
      )}
      {canManage && <Button size="sm" variant="ghost" icon="add" onClick={() => setOpen(true)}>New campaign</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="New security awareness campaign"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} disabled={!f.title.trim() || !f.due} onClick={async () => { if (await create.run()) { setOpen(false); router.refresh(); } }}>Assign to everyone</Button></>}>
        <div className="grid gap-4">
          <Input label="Title" placeholder="Q1 Security Awareness" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input label="Due date" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </div>
      </Dialog>
    </div>
  );
}
