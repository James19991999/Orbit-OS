import 'server-only';
import type { Currency } from '@/lib/format';
import { timingSafeEqual } from 'node:crypto';

/**
 * Minimal direct-fetch IntaSend client (no community SDK).
 * Endpoints per https://developers.intasend.com — verify against the current docs before going live.
 * Env vars are read inside each function (never at module load) so tests and runtime see current values.
 */
export type IntaSendState = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

export function intasendBaseUrl(): string {
  // INTASEND_BASE_URL is for local end-to-end tests against scripts/local-stack/intasend-mock.mjs only.
  if (process.env.INTASEND_BASE_URL) return process.env.INTASEND_BASE_URL.replace(/\/$/, '');
  return process.env.INTASEND_TEST_MODE === 'false' ? 'https://payment.intasend.com' : 'https://sandbox.intasend.com';
}

export function isIntaSendConfigured(): boolean {
  return Boolean(process.env.INTASEND_PUBLISHABLE_KEY && process.env.INTASEND_SECRET_KEY);
}

export class IntaSendError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) { super(message); }
}

async function call<T>(path: string, init: { method: 'POST' | 'GET'; body?: unknown; auth: 'public' | 'secret' }): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (init.auth === 'secret') headers.authorization = `Bearer ${process.env.INTASEND_SECRET_KEY}`;
  else headers['x-intasend-public-api-key'] = process.env.INTASEND_PUBLISHABLE_KEY ?? '';
  let res: Response;
  try {
    res = await fetch(`${intasendBaseUrl()}${path}`, {
      method: init.method, headers, body: init.body ? JSON.stringify(init.body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new IntaSendError(`IntaSend is unreachable: ${(e as Error).message}`);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = typeof data === 'object' && data ? JSON.stringify(data).slice(0, 300) : String(text).slice(0, 300);
    throw new IntaSendError(`IntaSend error ${res.status}: ${detail}`, res.status, data);
  }
  return data as T;
}

export interface CheckoutInput {
  amountMinor: number; currency: Currency; email: string; firstName?: string; lastName?: string;
  apiRef: string; redirectUrl: string; host: string; method?: 'M-PESA' | 'CARD-PAYMENT';
}
export interface CheckoutResult { id: string; url: string; signature?: string }

/** Hosted checkout page (card + M-Pesa). Amount is sent in major units. */
export function createCheckout(i: CheckoutInput): Promise<CheckoutResult> {
  return call<CheckoutResult>('/api/v1/checkout/', {
    method: 'POST', auth: 'public',
    body: {
      public_key: process.env.INTASEND_PUBLISHABLE_KEY, amount: (i.amountMinor / 100).toFixed(2), currency: i.currency,
      email: i.email, first_name: i.firstName ?? '', last_name: i.lastName ?? '', api_ref: i.apiRef,
      redirect_url: i.redirectUrl, host: i.host, ...(i.method ? { method: i.method } : {}),
    },
  });
}

export interface StkResult { invoice: { invoice_id: string; state: IntaSendState; api_ref?: string } }

/** In-app M-Pesa STK push (KES only). Phone must be normalised to 2547XXXXXXXX. */
export function mpesaStkPush(i: { amountMinor: number; phone: string; apiRef: string; email?: string; narrative?: string }): Promise<StkResult> {
  return call<StkResult>('/api/v1/payment/mpesa-stk-push/', {
    method: 'POST', auth: 'secret',
    body: { amount: Math.round(i.amountMinor / 100), phone_number: i.phone, api_ref: i.apiRef, email: i.email, narrative: i.narrative ?? 'OrbitOS' },
  });
}

export interface StatusResult { invoice: { invoice_id: string; state: IntaSendState; api_ref?: string; value?: string | number; currency?: string; failed_reason?: string | null } }

export function paymentStatus(invoiceId: string): Promise<StatusResult> {
  return call<StatusResult>('/api/v1/payment/status/', { method: 'POST', auth: 'secret', body: { invoice_id: invoiceId } });
}

/**
 * IntaSend webhooks carry the "challenge" string configured in the dashboard. This is weaker than an
 * HMAC signature (anyone who learns the challenge could forge a call), so the webhook handler ALSO
 * re-fetches the payment status from IntaSend before trusting any state change.
 */
export function verifyChallenge(received: unknown, expected = process.env.INTASEND_WEBHOOK_CHALLENGE): boolean {
  if (!expected || typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function normalizeState(s: unknown): IntaSendState | null {
  const v = String(s ?? '').toUpperCase();
  return v === 'PENDING' || v === 'PROCESSING' || v === 'COMPLETE' || v === 'FAILED' ? v : null;
}

// ───────── Send money (M-Pesa B2C payouts) ─────────
// Endpoints as used by IntaSend's official SDKs: POST send-money/initiate/ → POST send-money/approve/
// (with the initiate response, which carries the nonce) → POST send-money/status/ { tracking_id }.
// Verify against the sandbox before going live (docs/PAYOUTS.md).

export interface PayoutTx { name: string; account: string; amount: number | string; narrative?: string }
export interface SendMoneyTx { transaction_id?: string; status?: string; status_code?: string; status_description?: string; account?: string; amount?: number | string; request_reference_id?: string }
export interface SendMoneyBatch {
  tracking_id: string; status?: string; status_code?: string; nonce?: string; file_id?: string;
  transactions?: SendMoneyTx[]; [k: string]: unknown;
}

export function sendMoneyInitiate(i: { transactions: PayoutTx[]; callbackUrl?: string }): Promise<SendMoneyBatch> {
  return call<SendMoneyBatch>('/api/v1/send-money/initiate/', {
    method: 'POST', auth: 'secret',
    body: { provider: 'MPESA-B2C', currency: 'KES', requires_approval: 'YES', transactions: i.transactions, ...(i.callbackUrl ? { callback_url: i.callbackUrl } : {}) },
  });
}

/** Releases the batch. IntaSend expects the initiate response back (it includes the nonce). */
export function sendMoneyApprove(initiated: SendMoneyBatch): Promise<SendMoneyBatch> {
  return call<SendMoneyBatch>('/api/v1/send-money/approve/', { method: 'POST', auth: 'secret', body: initiated });
}

export function sendMoneyStatus(trackingId: string): Promise<SendMoneyBatch> {
  return call<SendMoneyBatch>('/api/v1/send-money/status/', { method: 'POST', auth: 'secret', body: { tracking_id: trackingId } });
}

export type TxOutcome = 'sent' | 'failed' | 'pending';
/** TS100 / "Successful" = paid. Explicit failure words or non-TS100 codes on a completed batch = failed. */
export function txOutcome(tx: SendMoneyTx, batchDone: boolean): TxOutcome {
  const s = String(tx.status ?? '').toLowerCase();
  const code = String(tx.status_code ?? '').toUpperCase();
  if (code === 'TS100' || s === 'successful' || s === 'success' || s === 'completed') return 'sent';
  if (/fail|reject|cancel|reverse|invalid/.test(s) || (code.startsWith('TF'))) return 'failed';
  return batchDone ? 'failed' : 'pending';
}
/** Batch has finished (each transaction is final) — "Completed" (BC100) or "Failed Processing". */
export function batchDone(b: SendMoneyBatch): { done: boolean; failedEarly: boolean } {
  const s = String(b.status ?? '').toLowerCase();
  const code = String(b.status_code ?? '').toUpperCase();
  const failedEarly = s.includes('failed processing') || code === 'BF102' || code === 'BF101';
  return { done: failedEarly || code === 'BC100' || s === 'completed', failedEarly };
}
