import { handler, json, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { createCheckout, isIntaSendConfigured, IntaSendError } from '@/lib/intasend/client';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { formatMoney } from '@/lib/format';
import { appUrl } from '@/lib/env';
import type { Invoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Creates (or reuses) an IntaSend payment link for a client invoice, emails it, and marks the invoice sent. */
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('invoice-send', ctx.user.id, 20, 60);
  const { data: inv, error } = await ctx.supabase.from('invoices').select('*').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!inv) throw new ApiError(404, 'Invoice not found');
  const invoice = inv as Invoice;
  if (invoice.status === 'paid' || invoice.status === 'void') throw new ApiError(409, `Invoice is already ${invoice.status}`);

  let paymentUrl = invoice.payment_url;
  let paymentLink: 'created' | 'reused' | 'not_configured' = paymentUrl ? 'reused' : 'not_configured';
  if (!paymentUrl && isIntaSendConfigured()) {
    try {
      const co = await createCheckout({
        amountMinor: invoice.amount_minor, currency: invoice.currency, email: invoice.client_email,
        firstName: invoice.client_name.split(' ')[0], lastName: invoice.client_name.split(' ').slice(1).join(' '),
        apiRef: `inv_${invoice.id}`, redirectUrl: `${appUrl()}/pay/complete?ref=inv_${invoice.id}`, host: appUrl(),
      });
      paymentUrl = co.url;
      paymentLink = 'created';
    } catch (e) {
      throw new ApiError(502, e instanceof IntaSendError ? e.message : 'Could not create the payment link');
    }
  }
  const admin = getAdminClient();
  const { error: upErr } = await admin.from('invoices').update({ payment_url: paymentUrl, status: 'sent' }).eq('id', invoice.id);
  if (upErr) throw new ApiError(500, upErr.message);

  const email = await sendEmail({
    to: invoice.client_email,
    subject: `Invoice ${invoice.number} from ${ctx.org.legal_name || ctx.org.name}`,
    html: emailLayout(`Invoice ${invoice.number}`,
      `<p>Hello ${escapeHtml(invoice.client_name)},</p><p>${escapeHtml(ctx.org.legal_name || ctx.org.name)} has sent you an invoice for <strong>${formatMoney(invoice.amount_minor, invoice.currency)}</strong>, due <strong>${invoice.due_on}</strong>.</p>${invoice.description ? `<p>${escapeHtml(invoice.description)}</p>` : ''}${paymentUrl ? '<p>You can pay securely by M-Pesa or card.</p>' : '<p>Please pay using the bank details agreed with us.</p>'}`,
      paymentUrl ? { label: 'Pay invoice', url: paymentUrl } : undefined),
  });
  await audit(req, ctx.org.id, ctx.user.id, 'invoice.sent', { type: 'invoice', id: invoice.id }, { paymentLink, emailed: email.sent });
  return json({ ok: true, paymentUrl, paymentLink, emailed: email.sent, emailReason: email.reason ?? null });
});
