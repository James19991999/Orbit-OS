import { handler, json, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { paymentStatus, isIntaSendConfigured } from '@/lib/intasend/client';
import { applyPaymentState } from '@/lib/billing/apply';

export const dynamic = 'force-dynamic';

/** Polled by the billing page (bounded to ~90s client-side). Also reconciles with IntaSend directly. */
export const GET = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'] });
  await rateLimit('billing-status', ctx.user.id, 60, 60);
  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  const admin = getAdminClient();
  const { data: p } = await admin.from('billing_payments').select('*').eq('api_ref', ref).eq('org_id', ctx.org.id).maybeSingle();
  if (!p) throw new ApiError(404, 'Payment not found');
  if (p.state === 'COMPLETE' || p.state === 'FAILED' || !p.intasend_invoice_id || !isIntaSendConfigured()) {
    return json({ state: p.state, applied: Boolean(p.applied_at) });
  }
  try {
    const s = await paymentStatus(p.intasend_invoice_id);
    await applyPaymentState(admin, ref, s.invoice?.state, p.intasend_invoice_id, s);
    return json({ state: s.invoice?.state ?? p.state, applied: s.invoice?.state === 'COMPLETE', reason: s.invoice?.failed_reason ?? null });
  } catch {
    return json({ state: p.state, applied: false }); // provider hiccup — the webhook will still settle it
  }
});
