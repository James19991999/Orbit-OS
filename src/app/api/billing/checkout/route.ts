import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { priceFor, seatsFor } from '@/lib/billing/plans';
import { createCheckout, mpesaStkPush, isIntaSendConfigured, IntaSendError } from '@/lib/intasend/client';
import { normalizeKePhone } from '@/lib/intasend/phone';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

const Body = z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
  period: z.enum(['monthly', 'annual']),
  extraBlocks: z.number().int().min(0).max(100).default(0),
  method: z.enum(['MPESA', 'CARD']),
  phone: z.string().max(20).optional(),
}).strict(); // no client-supplied amount is accepted, ever

export const POST = handler(async (req) => {
  // Billing must work on an expired (read-only) workspace, so `writable` is not required here.
  const ctx = await requireApiContext({ roles: ['owner'] });
  await rateLimit('checkout', ctx.user.id, 10, 300);
  if (!isIntaSendConfigured()) throw new ApiError(503, 'Payments are not configured yet (IntaSend keys missing).');
  const b = await parseBody(req, Body);
  const seats = seatsFor(b.plan, b.extraBlocks);
  const admin = getAdminClient();
  const { count } = await admin.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).eq('status', 'active');
  if ((count ?? 0) > seats) throw new ApiError(409, `You have ${count} active members; this plan covers ${seats} seats. Choose a bigger plan or add seat blocks.`);

  // M-Pesa settles in KES; cards charge in the workspace currency.
  const currency = b.method === 'MPESA' ? 'KES' : ctx.org.currency;
  const amount = priceFor(b.plan, b.period, currency, b.extraBlocks);
  const apiRef = `orb_${ctx.org.id}_${randomBytes(6).toString('hex')}`;
  let phone: string | null = null;
  if (b.method === 'MPESA') {
    phone = normalizeKePhone(b.phone ?? '');
    if (!phone) throw new ApiError(400, 'Enter a valid Safaricom number, e.g. 0712 345 678');
  }
  const { data: pay, error } = await admin.from('billing_payments').insert({
    org_id: ctx.org.id, created_by: ctx.user.id, plan: b.plan, period: b.period, seats, amount_minor: amount, currency, method: b.method, api_ref: apiRef, state: 'PENDING',
  }).select('id').single();
  if (error) throw new ApiError(500, error.message);

  try {
    if (b.method === 'MPESA') {
      const r = await mpesaStkPush({ amountMinor: amount, phone: phone!, apiRef, email: ctx.user.email ?? undefined, narrative: `OrbitOS ${b.plan} ${b.period}` });
      await admin.from('billing_payments').update({ intasend_invoice_id: r.invoice?.invoice_id ?? null, state: r.invoice?.state ?? 'PENDING' }).eq('id', pay.id);
      await audit(req, ctx.org.id, ctx.user.id, 'billing.checkout_started', { type: 'billing_payment', id: pay.id }, { method: 'MPESA', amount, currency, plan: b.plan, period: b.period });
      return json({ ref: apiRef, method: 'MPESA', amount, currency });
    }
    const co = await createCheckout({ amountMinor: amount, currency, email: ctx.user.email ?? '', apiRef, redirectUrl: `${appUrl()}/settings/billing?ref=${apiRef}`, host: appUrl(), method: 'CARD-PAYMENT' });
    await admin.from('billing_payments').update({ intasend_checkout_id: co.id }).eq('id', pay.id);
    await audit(req, ctx.org.id, ctx.user.id, 'billing.checkout_started', { type: 'billing_payment', id: pay.id }, { method: 'CARD', amount, currency, plan: b.plan, period: b.period });
    return json({ ref: apiRef, method: 'CARD', url: co.url, amount, currency });
  } catch (e) {
    await admin.from('billing_payments').update({ state: 'FAILED', raw: { error: (e as Error).message } }).eq('id', pay.id);
    throw new ApiError(502, e instanceof IntaSendError ? e.message : 'Payment provider error');
  }
});
