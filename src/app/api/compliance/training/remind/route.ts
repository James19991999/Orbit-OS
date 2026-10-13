import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { loadProfiles } from '@/lib/data/profiles';
import { makeT, isLanguage } from '@/i18n';
import { formatDate } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/** Emails people who haven't completed training. Each person is reminded at most once per 24h. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('training-remind', ctx.user.id, 5, 60);
  const { campaignId } = await parseBody(req, z.object({ campaignId: z.string().uuid() }));
  const { data: camp } = await ctx.supabase.from('training_campaigns').select('*').eq('id', campaignId).eq('org_id', ctx.org.id).maybeSingle();
  if (!camp) throw new ApiError(404, 'Campaign not found');
  // training_assignments.user_id references auth.users, not profiles, so profiles are loaded separately.
  const { data: assigned, error } = await ctx.supabase.from('training_assignments').select('user_id, last_reminded_at').eq('campaign_id', campaignId).is('completed_at', null);
  if (error) throw new ApiError(500, error.message);
  const profiles = await loadProfiles(ctx.supabase, (assigned ?? []).map((a: { user_id: string }) => a.user_id));
  const rows = (assigned ?? []).map((a: { user_id: string; last_reminded_at: string | null }) => ({ ...a, profile: profiles.get(a.user_id) ?? null }));
  if (!isEmailConfigured()) return json({ emailed: 0, skipped: 0, pending: rows.length, notConfigured: true });
  const dayAgo = Date.now() - 86_400_000;
  let emailed = 0; let skipped = 0;
  const admin = getAdminClient();
  for (const r of rows) {
    if (r.last_reminded_at && new Date(r.last_reminded_at).getTime() > dayAgo) { skipped++; continue; }
    if (!r.profile?.email) continue;
    const lang = isLanguage(r.profile.language) ? r.profile.language : 'en';
    const t = makeT(lang);
    const due = formatDate(`${camp.due_on}T12:00:00Z`, 'long', undefined, 'UTC', lang);
    const res = await sendEmail({ to: r.profile.email, subject: t('email.training.subject', { title: camp.title, date: due }),
      html: emailLayout(camp.title, `<p>${escapeHtml(t('email.training.hi', { name: r.profile.full_name.split(' ')[0] ?? '' }))}</p><p>${t('email.training.body', { title: `<strong>${escapeHtml(camp.title)}</strong>`, date: `<strong>${escapeHtml(due)}</strong>` })}</p>`, { label: t('email.brief.cta'), url: `${appUrl()}/compliance` }, t('email.footer')) });
    if (res.sent) {
      emailed++;
      const st = await admin.from('training_assignments').update({ last_reminded_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('user_id', r.user_id);
      if (st.error) console.error('[training] could not stamp reminder', st.error.message);
    }
  }
  await audit(req, ctx.org.id, ctx.user.id, 'compliance.training_reminders', { type: 'training_campaign', id: campaignId }, { emailed, skipped });
  return json({ emailed, skipped, pending: rows.length, notConfigured: false });
});
