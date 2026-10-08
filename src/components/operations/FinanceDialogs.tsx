'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Select, Textarea, InlineError } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';
import { parseMoneyToMinor, CURRENCIES, type Currency } from '@/lib/format';
import { nextInvoiceNumber } from '@/lib/metrics/invoices';
import { useFormat } from '@/lib/locale/client';

const KINDS = [
  { value: 'expense', label: 'Expense' }, { value: 'revenue', label: 'Revenue' },
  { value: 'payroll', label: 'Payroll' }, { value: 'cash_balance', label: 'Cash balance (bank statement)' },
];

export function FinanceEntryDialog({ open, onClose, orgId, currency, thresholdMinor, defaultKind = 'expense' }:
  { open: boolean; onClose: () => void; orgId: string; currency: Currency; thresholdMinor: number; defaultKind?: string }) {
  const fmt = useFormat();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ kind: defaultKind, amount: '', category: '', vendor: '', occurred_on: today, note: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setErr(null); setF((x) => ({ ...x, kind: defaultKind })); } }, [open, defaultKind]);
  const minor = fmt.parseMoney(f.amount);
  const save = useAction(async () => unwrap(await requireBrowserClient().from('finance_entries').insert({
    org_id: orgId, kind: f.kind, amount_minor: minor, currency, category: f.category.trim() || null, vendor: f.vendor.trim() || null,
    occurred_on: f.occurred_on, note: f.note.trim() || null,
  }).select('approval_status').single()) as { approval_status: string });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (minor === null || minor <= 0) return setErr('Enter an amount greater than zero (up to 2 decimals).');
    setErr(null);
    const r = await save.run();
    if (r) {
      onClose();
      setF({ kind: defaultKind, amount: '', category: '', vendor: '', occurred_on: today, note: '' });
      router.refresh();
    }
  }
  const needsApproval = f.kind === 'expense' && minor !== null && minor > thresholdMinor;
  return (
    <Dialog open={open} onClose={onClose} title="Log a finance entry"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="fin-form" loading={save.pending}>Save entry</Button></>}>
      <form id="fin-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={KINDS} />
        <Input label={`Amount (${currency})`} inputMode="decimal" placeholder="0.00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })}
          hint={needsApproval ? `Above ${fmt.money(thresholdMinor, currency)} — another owner or director must approve it.` : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Category" placeholder="Cloud, Software, Travel…" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Input label={f.kind === 'revenue' ? 'Customer' : 'Vendor'} value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
        </div>
        <Input label="Date" type="date" value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />
        <Textarea label="Note" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <InlineError message={err ?? save.error} />
      </form>
    </Dialog>
  );
}

/** Parses "period,countries,total,provider" CSV rows (header optional). Exported for tests. */
export function parsePayrollCsv(text: string): { rows: { period: string; country_count: number; total_minor: number; provider_label: string }[]; errors: string[] } {
  const rows: { period: string; country_count: number; total_minor: number; provider_label: string }[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /period/i.test(cells[0] ?? '')) return;
    const [period, countries, total, provider] = cells;
    const minor = parseMoneyToMinor(total ?? '');
    if (!/^\d{4}-\d{2}$/.test(period ?? '')) errors.push(`Line ${i + 1}: period must look like 2026-09`);
    else if (!Number.isInteger(Number(countries)) || Number(countries) < 1) errors.push(`Line ${i + 1}: countries must be a whole number`);
    else if (minor === null) errors.push(`Line ${i + 1}: total must be a number`);
    else rows.push({ period, country_count: Number(countries), total_minor: minor, provider_label: provider || 'Manual' });
  });
  return { rows, errors };
}

export function PayrollDialog({ open, onClose, orgId, currency }: { open: boolean; onClose: () => void; orgId: string; currency: Currency }) {
  const fmt = useFormat();
  const router = useRouter();
  const [mode, setMode] = useState<'single' | 'csv'>('single');
  const [f, setF] = useState({ period: new Date().toISOString().slice(0, 7), countries: '1', total: '', provider: 'Manual', paid_on: '' });
  const [csv, setCsv] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(async (rows: Record<string, unknown>[]) => unwrap(await requireBrowserClient().from('payroll_runs').insert(rows).select('id')), { success: 'Payroll recorded' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    let rows: Record<string, unknown>[];
    if (mode === 'single') {
      const minor = fmt.parseMoney(f.total);
      if (!/^\d{4}-\d{2}$/.test(f.period)) return setErr('Pick the payroll month.');
      if (minor === null || minor <= 0) return setErr('Enter the payroll total.');
      rows = [{ org_id: orgId, period: f.period, country_count: Number(f.countries) || 1, total_minor: minor, currency, provider_label: f.provider.trim() || 'Manual', status: f.paid_on ? 'settled' : 'recorded', paid_on: f.paid_on || null }];
    } else {
      const parsed = parsePayrollCsv(csv);
      if (parsed.errors.length) return setErr(parsed.errors.slice(0, 3).join(' · '));
      if (!parsed.rows.length) return setErr('Paste at least one row.');
      rows = parsed.rows.map((r) => ({ ...r, org_id: orgId, currency, status: 'settled' }));
    }
    if (await save.run(rows)) { onClose(); router.refresh(); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Record payroll" description="OrbitOS records payroll you ran with your provider. It does not move money."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="pay-form" loading={save.pending}>Save</Button></>}>
      <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Entry mode">
        {(['single', 'csv'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
            className={`h-8 rounded border px-3 text-label-sm ${mode === m ? 'border-primary-container bg-primary-container/15' : 'border-outline-variant text-on-surface-variant'}`}>
            {m === 'single' ? 'Single run' : 'Import CSV'}
          </button>
        ))}
      </div>
      <form id="pay-form" onSubmit={submit} className="grid gap-4" noValidate>
        {mode === 'single' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Month" type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
              <Input label="Countries paid" type="number" min={1} value={f.countries} onChange={(e) => setF({ ...f, countries: e.target.value })} />
            </div>
            <Input label={`Total (${currency})`} inputMode="decimal" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Provider" placeholder="Wise, Deel, Manual…" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
              <Input label="Paid on (optional)" type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} />
            </div>
          </>
        ) : (
          <Textarea label="CSV rows" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} hint={`period,countries,total,provider — e.g. 2026-09,9,12500000.00,Deel (${currency})`} className="font-mono" />
        )}
        <InlineError message={err ?? save.error} />
      </form>
    </Dialog>
  );
}

export function InvoiceDialog({ open, onClose, orgId, currency, existingNumbers }: { open: boolean; onClose: () => void; orgId: string; currency: Currency; existingNumbers: string[] }) {
  const fmt = useFormat();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ client_name: '', client_email: '', description: '', amount: '', currency, terms: '30', issued_on: today, send: true });
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(async () => {
    const minor = fmt.parseMoney(f.amount)!;
    const due = new Date(Date.parse(f.issued_on) + Number(f.terms) * 86_400_000).toISOString().slice(0, 10);
    const inv = unwrap(await requireBrowserClient().from('invoices').insert({
      org_id: orgId, number: nextInvoiceNumber(existingNumbers, Number(f.issued_on.slice(0, 4))), client_name: f.client_name.trim(), client_email: f.client_email.trim(),
      description: f.description.trim() || null, amount_minor: minor, currency: f.currency, terms_days: Number(f.terms), issued_on: f.issued_on, due_on: due, status: 'draft',
    }).select('id').single()) as { id: string };
    if (f.send) await postJson(`/api/invoices/${inv.id}/send`);
    return inv;
  }, { success: f.send ? 'Invoice sent with an M-Pesa / card payment link' : 'Draft invoice saved' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = fmt.parseMoney(f.amount);
    if (!f.client_name.trim()) return setErr('Enter the client name.');
    if (!/^\S+@\S+\.\S+$/.test(f.client_email)) return setErr('Enter a valid client email.');
    if (minor === null || minor <= 0) return setErr('Enter the invoice amount.');
    setErr(null);
    if (await save.run()) { onClose(); router.refresh(); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Issue an invoice" description="Clients pay through an IntaSend link by M-Pesa or card; it's marked paid automatically."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="inv-form" loading={save.pending}>{f.send ? 'Create & send' : 'Save draft'}</Button></>}>
      <form id="inv-form" onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Client name" value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} />
          <Input label="Client billing email" type="email" value={f.client_email} onChange={(e) => setF({ ...f, client_email: e.target.value })} />
        </div>
        <Textarea label="Description" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Input label={`Amount (${f.currency})`} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Select label="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            hint={f.currency !== currency ? `Revenue in ${f.currency} isn't counted in your ${currency} finance metrics.` : undefined} />
          <Select label="Terms" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} options={[7, 14, 30, 45, 60].map((d) => ({ value: String(d), label: `Net ${d}` }))} />
          <Input label="Issue date" type="date" value={f.issued_on} onChange={(e) => setF({ ...f, issued_on: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-body-md"><input type="checkbox" checked={f.send} onChange={(e) => setF({ ...f, send: e.target.checked })} className="h-4 w-4 accent-[#2563eb]" />Email the client a payment link now</label>
        <InlineError message={err ?? save.error} />
      </form>
    </Dialog>
  );
}
