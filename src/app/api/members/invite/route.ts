import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { likeExact } from '@/lib/security/request-guard';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { getT } from '@/i18n/server';
import { roleName } from '@/lib/role-name';

export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email().max(254), role: z.enum(['director', 'contributor', 'auditor']) });

export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('invite', ctx.user.id, 30, 3600);
  const { email, role } = await parseBody(req, Body);
  if (ctx.role === 'director' && role === 'director') throw new ApiError(403, 'Only owners can invite directors');
  const admin = getAdminClient();
  const [{ count: active }, { count: pending }] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).eq('status', 'active'),
    admin.from('invites').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()),
  ]);
  if ((active ?? 0) + (pending ?? 0) >= ctx.org.seat_limit) throw new ApiError(409, `All ${ctx.org.seat_limit} seats are used or reserved by pending invites. Add seats in Billing.`);
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', likeExact(email)).maybeSingle();
  if (existing) {
    const { data: m } = await admin.from('memberships').select('status').eq('org_id', ctx.org.id).eq('user_id', existing.id).maybeSingle();
    if (m?.status === 'active') throw new ApiError(409, 'That person is already a member');
  }
  const code = randomBytes(24).toString('base64url');
  const { data: inv, error } = await admin.from('invites').insert({ org_id: ctx.org.id, email: email.toLowerCase(), role, code, invited_by: ctx.user.id }).select('id, expires_at').single();
  if (error) throw new ApiError(500, error.message);
  const link = `${appUrl()}/join/${code}`;
  // The invitee has no account yet, so the email uses the inviter's language.
  const t = await getT();
  const mail = await sendEmail({ to: email, subject: t('email.invite.subject', { org: ctx.org.name }),
    html: emailLayout(t('email.invite.title', { org: ctx.org.name }), `<p>${t('email.invite.body', { org: `<strong>${escapeHtml(ctx.org.name)}</strong>`, role: `<strong>${escapeHtml(roleName(t, role))}</strong>` })}</p>`, { label: t('email.invite.cta'), url: link }, t('email.footer')) });
  await audit(req, ctx.org.id, ctx.user.id, 'member.invited', { type: 'invite', id: inv.id }, { email, role, emailed: mail.sent });
  return json({ ok: true, link, emailed: mail.sent, emailReason: mail.reason ?? null });
});
