import { type NextRequest } from 'next/server';
import { json, rateLimit, clientIp, ApiError, handler } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { verifyChallenge, paymentStatus, isIntaSendConfigured } from '@/lib/intasend/client';
import { applyPaymentState } from '@/lib/billing/apply';

export const dynamic = 'force-dynamic';

/**
 * IntaSend webhook. Security model:
 *  1. The payload must carry our dashboard "challenge" (compared in constant time).
 *  2. We never trust the payload's state: we re-fetch the status from IntaSend with our secret key.
 *  3. Application is idempotent (api_ref is unique; RPCs ignore already-applied payments).
 */
export const POST = handler(async (req: NextRequest) => {
  await rateLimit('intasend-webhook', clientIp(req), 120, 60);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { throw new ApiError(400, 'Invalid JSON'); }
  if (!verifyChallenge(body.challenge)) throw new ApiError(401, 'Invalid challenge');
  const apiRef = typeof body.api_ref === 'string' ? body.api_ref : '';
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : null;
  if (!apiRef || !invoiceId) return json({ ok: true, ignored: 'missing api_ref or invoice_id' });
  if (!isIntaSendConfigured()) throw new ApiError(503, 'IntaSend keys not configured; cannot verify payment');

  const verified = await paymentStatus(invoiceId).catch(() => null);
  if (!verified?.invoice) throw new ApiError(502, 'Could not verify payment with IntaSend'); // IntaSend retries
  if (verified.invoice.api_ref && verified.invoice.api_ref !== apiRef) throw new ApiError(400, 'api_ref mismatch');
  const result = await applyPaymentState(getAdminClient(), apiRef, verified.invoice.state, invoiceId, { webhook: body, verified });
  return json({ ok: true, result });
});
