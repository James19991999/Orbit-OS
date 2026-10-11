import 'server-only';
import { recordDeliveryFailure } from '@/lib/founder/record';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * WhatsApp Business Cloud API (Meta). Messages that OrbitOS starts (codes, reminders, approval
 * requests) must use templates pre-approved in WhatsApp Manager — see docs/WHATSAPP.md for the
 * exact templates. Free-form text is only allowed as a reply within 24h of the person's last message.
 *
 * Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN.
 * WHATSAPP_API_BASE is only for the local test mock.
 */
const GRAPH_VERSION = 'v21.0';

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET);
}

function base(): string {
  return (process.env.WHATSAPP_API_BASE || `https://graph.facebook.com/${GRAPH_VERSION}`).replace(/\/$/, '');
}

export class WhatsAppError extends Error {
  constructor(message: string, public status: number, public detail?: unknown) { super(message); }
}

async function post(body: Record<string, unknown>): Promise<{ messageId: string | null }> {
  const kind = String((body.template as { name?: string } | undefined)?.name ?? body.type ?? 'message');
  let res: Response;
  try {
    res = await fetch(`${base()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  } catch (e) {
    await recordDeliveryFailure('whatsapp', (e as Error).message, kind);
    throw e;
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
    await recordDeliveryFailure('whatsapp', `${res.status}: ${msg}`, kind);
    throw new WhatsAppError(`WhatsApp error ${res.status}: ${msg}`, res.status, data);
  }
  const id = (data as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id ?? null;
  return { messageId: id };
}

/** Plain text — only valid within 24h of the recipient's last inbound message. */
export function sendText(to: string, body: string) {
  return post({ to, type: 'text', text: { body: body.slice(0, 4096), preview_url: false } });
}

export type TemplateLanguage = 'en' | 'sw' | 'fr';

/**
 * Sends an approved template. `params` fill {{1}}, {{2}}… in the body; `buttons` set the payload
 * returned when the person taps quick-reply button 0, 1, …; `codeButton` fills the copy-code
 * button of an authentication template.
 */
export function sendTemplate(to: string, name: string, language: TemplateLanguage, params: string[], opts: { buttons?: string[]; codeButton?: string } = {}) {
  const components: Record<string, unknown>[] = [];
  if (params.length) components.push({ type: 'body', parameters: params.map((text) => ({ type: 'text', text: text.slice(0, 1000) })) });
  (opts.buttons ?? []).forEach((payload, index) => components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] }));
  if (opts.codeButton) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: opts.codeButton }] });
  return post({ to, type: 'template', template: { name, language: { code: language === 'en' ? 'en' : language }, components } });
}

/** Template names (create them in WhatsApp Manager with exactly these names; see docs/WHATSAPP.md). */
export const TEMPLATES = {
  verify: 'orbitos_verify_code',
  checkin: 'orbitos_checkin_reminder',
  approval: 'orbitos_expense_approval',
  brief: 'orbitos_weekly_brief',
} as const;

/** Meta signs each webhook with X-Hub-Signature-256: sha256=HMAC(app secret, raw body). */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Normalises a phone number to E.164 digits without "+": "+254 712 345 678", "0712345678"
 * (Kenyan local format), "001 415 555 0100" → "254712345678" / "14155550100". Null if invalid.
 */
export function normalizeWhatsAppPhone(input: string): string | null {
  let d = input.trim().replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^0(7|1)\d{8}$/.test(d)) d = '254' + d.slice(1); // Kenyan local format
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}

/** "+254 7•• ••• 678" for display without exposing the full number. */
export function maskPhone(e164: string): string {
  return `+${e164.slice(0, 4)} ••• ••• ${e164.slice(-3)}`;
}
