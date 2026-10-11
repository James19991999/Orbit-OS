import { handler, json, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { createCheckout, isIntaSendConfigured, IntaSendError } from '@/lib/intasend/client';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { formatMoney } from '@/lib/format';
import { formatDate, localeForCurrency } from '@/lib/locale';
import { appUrl } from '@/lib/env';
import { cardCurrencies } from '@/lib/intasend/currencies';
import type { Invoice } from '@/lib/types';
import { queueInvoiceSale } from '@/lib/etims/service';

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
  // A client invoice can't be converted, so if IntaSend can't take its currency the email asks for a bank transfer.
  if (!paymentUrl && isIntaSendConfigured() && cardCurrencies().includes(invoice.currency)) {
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

  // The client isn't a user, so format for the invoice's currency region (USD → US style, GBP → UK style…).
  const clientLocale = localeForCurrency(invoice.currency);
  const email = await sendEmail({
    to: invoice.client_email,
    subject: `Invoice ${invoice.number} from ${ctx.org.legal_name || ctx.org.name}`,
    html: emailLayout(`Invoice ${invoice.number}`,
      `<p>Hello ${escapeHtml(invoice.client_name)},</p><p>${escapeHtml(ctx.org.legal_name || ctx.org.name)} has sent you an invoice for <strong>${formatMoney(invoice.amount_minor, invoice.currency, { locale: clientLocale })}</strong>, due <strong>${formatDate(`${invoice.due_on}T12:00:00Z`, 'long', clientLocale)}</strong>.</p>${invoice.description ? `<p>${escapeHtml(invoice.description)}</p>` : ''}${paymentUrl ? (invoice.currency === 'KES' ? '<p>You can pay securely by M-Pesa or card.</p>' : '<p>You can pay securely by card.</p>') : '<p>Please pay using the bank details agreed with us.</p>'}`,
      paymentUrl ? { label: 'Pay invoice', url: paymentUrl } : undefined),
  });
  // Fiscalise with KRA eTIMS when the workspace has it connected. KRA being slow or down never blocks sending:
  // the document waits in the queue and the hourly job retries it.
  let etims: { status: string; reason?: string } = { status: 'not_sent', reason: 'not_configured' };
  try {
    const r = await queueInvoiceSale(admin, invoice);
    etims = r.queued ? { status: r.doc?.status ?? 'queued' } : { status: 'not_sent', reason: r.reason };
  } catch (e) {
    console.error('[etims] invoice', invoice.id, (e as Error).message);
    etims = { status: 'queued' };
  }
  await audit(req, ctx.org.id, ctx.user.id, 'invoice.sent', { type: 'invoice', id: invoice.id }, { paymentLink, emailed: email.sent, etims: etims.status });
  return json({ ok: true, paymentUrl, paymentLink, emailed: email.sent, emailReason: email.reason ?? null, etims });
});
