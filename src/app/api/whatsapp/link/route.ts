import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, rateLimit, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { isWhatsAppConfigured, normalizeWhatsAppPhone, sendTemplate, TEMPLATES, WhatsAppError, maskPhone } from '@/lib/whatsapp/client';
import { isLanguage } from '@/i18n';

export const dynamic = 'force-dynamic';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const hashCode = (userId: string, code: string) => createHmac('sha256', process.env.WHATSAPP_APP_SECRET || 'unset').update(`${userId}:${code}`).digest('hex');

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), phone: z.string().min(6).max(24) }).strict(),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/) }).strict(),
]);

/** Step 1: send a 6-digit code to the number. Step 2: confirm it and link the number. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext();
  if (!isWhatsAppConfigured()) throw new ApiError(503, 'WhatsApp is not set up for this deployment yet.');
  const b = await parseBody(req, Body);
  const admin = getAdminClient();
  if (b.action === 'start') {
    await rateLimit('wa-link-start', ctx.user.id, 5, 3600);
    const phone = normalizeWhatsAppPhone(b.phone);
    if (!phone) throw new ApiError(400, 'Enter the number with its country code, e.g. +254 712 345 678.');
    const { data: taken } = await admin.from('whatsapp_links').select('user_id').eq('phone', phone).maybeSingle();
    if (taken && taken.user_id !== ctx.user.id) throw new ApiError(409, 'That number is already linked to another OrbitOS account.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { error } = await admin.from('whatsapp_verifications').upsert({ user_id: ctx.user.id, phone, code_hash: hashCode(ctx.user.id, code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), attempts: 0 });
    if (error) throw new ApiError(500, error.message);
    const { data: prof } = await admin.from('profiles').select('language').eq('id', ctx.user.id).maybeSingle();
    try {
      await sendTemplate(phone, TEMPLATES.verify, isLanguage(prof?.language) ? prof!.language : 'en', [code], { codeButton: code });
    } catch (e) {
      throw new ApiError(502, e instanceof WhatsAppError ? `WhatsApp could not deliver the code: ${e.message}` : 'WhatsApp could not deliver the code.');
    }
    return json({ sent: true, to: maskPhone(phone) });
  }
  await rateLimit('wa-link-verify', ctx.user.id, 10, 600);
  const { data: v } = await admin.from('whatsapp_verifications').select('*').eq('user_id', ctx.user.id).maybeSingle();
  if (!v || new Date(v.expires_at).getTime() < Date.now()) throw new ApiError(410, 'That code has expired. Send a new one.');
  if (v.attempts >= MAX_ATTEMPTS) throw new ApiError(429, 'Too many wrong codes. Send a new one.');
  const ok = timingSafeEqual(Buffer.from(hashCode(ctx.user.id, b.code)), Buffer.from(v.code_hash));
  if (!ok) {
    await admin.from('whatsapp_verifications').update({ attempts: v.attempts + 1 }).eq('user_id', ctx.user.id);
    throw new ApiError(400, 'That code is not right. Check the latest WhatsApp message.');
  }
  const { error: le } = await admin.from('whatsapp_links').upsert({ user_id: ctx.user.id, phone: v.phone, verified_at: new Date().toISOString() });
  if (le) throw new ApiError(le.code === '23505' ? 409 : 500, le.code === '23505' ? 'That number is already linked to another OrbitOS account.' : le.message);
  await admin.from('whatsapp_verifications').delete().eq('user_id', ctx.user.id);
  await audit(req, ctx.org.id, ctx.user.id, 'profile.whatsapp_linked', { type: 'user', id: ctx.user.id }, { phone: maskPhone(v.phone) });
  return json({ linked: true, phone: maskPhone(v.phone) });
});

export const DELETE = handler(async (req) => {
  const ctx = await requireApiContext();
  const { error } = await getAdminClient().from('whatsapp_links').delete().eq('user_id', ctx.user.id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'profile.whatsapp_unlinked', { type: 'user', id: ctx.user.id });
  return json({ linked: false });
});
