export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type InvoiceDisplay = InvoiceStatus | 'overdue' | 'due_today';

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function invoiceDisplayStatus(inv: { status: InvoiceStatus; due_on: string }, now: Date = new Date()): InvoiceDisplay {
  if (inv.status !== 'sent') return inv.status;
  const today = todayIso(now);
  if (inv.due_on < today) return 'overdue';
  if (inv.due_on === today) return 'due_today';
  return 'sent';
}

export function unpaidSummary(invoices: { status: InvoiceStatus; due_on: string; amount_minor: number }[], now: Date = new Date()) {
  const unpaid = invoices.filter((i) => i.status === 'sent');
  return {
    count: unpaid.length,
    total: unpaid.reduce((a, i) => a + Number(i.amount_minor), 0),
    dueToday: unpaid.filter((i) => invoiceDisplayStatus(i, now) === 'due_today').length,
    overdue: unpaid.filter((i) => invoiceDisplayStatus(i, now) === 'overdue').length,
  };
}

export function nextInvoiceNumber(existing: string[], year = new Date().getUTCFullYear()): string {
  const prefix = `INV-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return prefix + String(max + 1).padStart(4, '0');
}
