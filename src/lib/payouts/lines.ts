import { normalizeKePhone } from '@/lib/intasend/phone';

/** Payout line validation and CSV parsing — shared by the browser form and the API. */
export const MAX_LINES = 500;
export const MIN_MINOR = 1_000;          // KES 10
export const MAX_MINOR = 25_000_000;     // KES 250,000 per M-Pesa transfer

export interface LineInput { name: string; phone: string; amount_minor: number; user_id?: string | null; narrative?: string | null }
export interface LineError { row: number; message: string }

/** Validates and normalises payout lines. Phone numbers become 2547…/2541…. */
export function validateLines(lines: LineInput[]): { ok: LineInput[]; errors: LineError[] } {
  const ok: LineInput[] = []; const errors: LineError[] = [];
  if (!lines.length) errors.push({ row: 0, message: 'Add at least one person to pay.' });
  if (lines.length > MAX_LINES) errors.push({ row: 0, message: `A batch can have at most ${MAX_LINES} people.` });
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const row = i + 1;
    const name = (l.name ?? '').trim();
    const phone = normalizeKePhone(l.phone ?? '');
    if (!name) errors.push({ row, message: 'Name is missing.' });
    if (!phone) errors.push({ row, message: `"${l.phone}" is not a Kenyan M-Pesa number (07… or 01…).` });
    if (!Number.isInteger(l.amount_minor) || l.amount_minor < MIN_MINOR || l.amount_minor > MAX_MINOR) errors.push({ row, message: 'Amount must be between KES 10 and KES 250,000.' });
    if (phone && seen.has(phone)) errors.push({ row, message: `${phone} appears twice in this batch.` });
    if (phone) seen.add(phone);
    if (name && phone && Number.isInteger(l.amount_minor)) ok.push({ name: name.slice(0, 120), phone, amount_minor: l.amount_minor, user_id: l.user_id ?? null, narrative: (l.narrative ?? '').trim().slice(0, 100) || null });
  });
  return { ok, errors };
}

/** CSV with columns name,phone,amount (header optional). Amount in KES, e.g. 45000 or 45,000.50. */
export function parsePayoutCsv(text: string): { lines: LineInput[]; errors: LineError[] } {
  const lines: LineInput[] = []; const errors: LineError[] = [];
  text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean).forEach((r, i) => {
    const cells = r.match(/("([^"]|"")*"|[^,]+)/g)?.map((c) => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
    if (i === 0 && /name/i.test(cells[0] ?? '') && /phone|mpesa|number/i.test(cells[1] ?? '')) return;
    // amount may itself contain a thousands comma: name,phone,45,000.50 → rejoin the tail
    const [name, phone, ...rest] = cells;
    const amount = Number(rest.join('').replace(/[^\d.]/g, ''));
    if (!name || !phone || !rest.length || !Number.isFinite(amount)) { errors.push({ row: i + 1, message: `Expected name,phone,amount — got "${r.slice(0, 60)}"` }); return; }
    lines.push({ name, phone, amount_minor: Math.round(amount * 100) });
  });
  return { lines, errors };
}

