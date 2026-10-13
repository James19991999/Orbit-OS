import 'server-only';
import { Resend } from 'resend';
import { recordDeliveryFailure } from '@/lib/founder/record';

export interface EmailResult { sent: boolean; reason?: 'not_configured' | 'error'; error?: string }

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Sends via Resend. Returns an honest result instead of pretending when email isn't configured. */
export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text?: string;
  attachments?: { filename: string; content: Buffer | string }[] }): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'not_configured' };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'OrbitOS <onboarding@resend.dev>',
      to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (error) { await recordDeliveryFailure('email', error.message, msg.subject); return { sent: false, reason: 'error', error: error.message }; }
    return { sent: true };
  } catch (e) {
    await recordDeliveryFailure('email', (e as Error).message, msg.subject);
    return { sent: false, reason: 'error', error: (e as Error).message };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Plain, accessible transactional layout. */
/** footer: the translated footer line (t('email.footer')); English when omitted. */
/** footerLinkHtml: optional trusted HTML (e.g. an unsubscribe link) shown after the footer line. */
export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }, footer = 'Sent by OrbitOS · You can change email preferences in your profile.', footerLinkHtml = '') {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:16px">OrbitOS</td></tr>
  <tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1><div style="font-size:14px;line-height:22px;color:#334155">${bodyHtml}</div>
  ${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:600">${esc(cta.label)}</a></p>` : ''}
  </td></tr></table><p style="font-size:12px;color:#64748b;margin-top:16px">${esc(footer)}${footerLinkHtml ? ` · ${footerLinkHtml}` : ''}</p></td></tr></table></body></html>`;
}
export { esc as escapeHtml };
