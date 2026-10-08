import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { ROLE_LABEL } from '@/lib/roles';

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
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) {
    const { data: m } = await admin.from('memberships').select('status').eq('org_id', ctx.org.id).eq('user_id', existing.id).maybeSingle();
    if (m?.status === 'active') throw new ApiError(409, 'That person is already a member');
  }
  const code = randomBytes(24).toString('base64url');
  const { data: inv, error } = await admin.from('invites').insert({ org_id: ctx.org.id, email: email.toLowerCase(), role, code, invited_by: ctx.user.id }).select('id, expires_at').single();
  if (error) throw new ApiError(500, error.message);
  const link = `${appUrl()}/join/${code}`;
  const mail = await sendEmail({ to: email, subject: `You're invited to ${ctx.org.name} on OrbitOS`,
    html: emailLayout(`Join ${ctx.org.name}`, `<p>You've been invited to join <strong>${escapeHtml(ctx.org.name)}</strong> as <strong>${ROLE_LABEL[role]}</strong>. The link expires in 7 days.</p>`, { label: 'Accept invite', url: link }) });
  await audit(req, ctx.org.id, ctx.user.id, 'member.invited', { type: 'invite', id: inv.id }, { email, role, emailed: mail.sent });
  return json({ ok: true, link, emailed: mail.sent, emailReason: mail.reason ?? null });
});
