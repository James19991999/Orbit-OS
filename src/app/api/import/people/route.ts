import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { getT } from '@/i18n/server';
import { roleName } from '@/lib/role-name';
import { EMAIL_RE } from '@/lib/import/table';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Row = z.object({
  email: z.string().trim().toLowerCase().max(254).regex(EMAIL_RE),
  role: z.enum(['director', 'contributor', 'auditor']),
  title: z.string().trim().max(100).nullable().optional(),
  department: z.string().trim().max(100).nullable().optional(),
}).strict();
const Body = z.object({ rows: z.array(Row).min(1).max(200) }).strict();

/** Bulk invites from a spreadsheet. Same rules as one invite: managers only, directors can't invite directors, seat limit. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('import-people', ctx.user.id, 5, 3600);
  const { rows } = await parseBody(req, Body);
  if (ctx.role === 'director' && rows.some((r) => r.role === 'director')) throw new ApiError(403, 'Only owners can invite directors');
  const admin = getAdminClient();
  const emails = [...new Set(rows.map((r) => r.email))];
  if (emails.length !== rows.length) throw new ApiError(400, 'The same email appears twice');
  const [{ count: active }, { count: pending }, { data: existingProfiles }] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).eq('status', 'active'),
    admin.from('invites').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()),
    admin.from('profiles').select('id, email').in('email', emails),
  ]);
  const free = ctx.org.seat_limit - (active ?? 0) - (pending ?? 0);
  if (rows.length > free) throw new ApiError(409, `seats:${Math.max(0, free)}`);
  const ids = (existingProfiles ?? []).map((p) => p.id as string);
  const { data: already } = ids.length
    ? await admin.from('memberships').select('user_id').eq('org_id', ctx.org.id).eq('status', 'active').in('user_id', ids)
    : { data: [] as { user_id: string }[] };
  const memberEmails = new Set((existingProfiles ?? []).filter((p) => (already ?? []).some((m) => m.user_id === p.id)).map((p) => (p.email as string).toLowerCase()));
  const toInvite = rows.filter((r) => !memberEmails.has(r.email));
  const inserted = toInvite.length
    ? await admin.from('invites').insert(toInvite.map((r) => ({
        org_id: ctx.org.id, email: r.email, role: r.role, title: r.title || null, department: r.department || null,
        code: randomBytes(24).toString('base64url'), invited_by: ctx.user.id,
      }))).select('id, email, role, code')
    : { data: [] as { id: string; email: string; role: string; code: string }[], error: null };
  if (inserted.error) throw new ApiError(500, inserted.error.message);
  const t = await getT();
  let emailed = 0;
  const list = inserted.data ?? [];
  for (let i = 0; i < list.length; i += 4) {
    const sent = await Promise.all(list.slice(i, i + 4).map((inv) => sendEmail({
      to: inv.email, subject: t('email.invite.subject', { org: ctx.org.name }),
      html: emailLayout(t('email.invite.title', { org: ctx.org.name }),
        `<p>${t('email.invite.body', { org: `<strong>${escapeHtml(ctx.org.name)}</strong>`, role: `<strong>${escapeHtml(roleName(t, inv.role as 'director'))}</strong>` })}</p>`,
        { label: t('email.invite.cta'), url: `${appUrl()}/join/${inv.code}` }, t('email.footer')),
    }).then((r) => r.sent, () => false)));
    emailed += sent.filter(Boolean).length;
  }
  await audit(req, ctx.org.id, ctx.user.id, 'member.imported', { type: 'invite' }, { count: list.length, skipped: rows.length - list.length, emailed });
  return json({ created: list.length, skipped: [...memberEmails], emailed });
});
