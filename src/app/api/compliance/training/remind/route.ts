import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendEmail, emailLayout, escapeHtml, isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Emails people who haven't completed training. Each person is reminded at most once per 24h. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('training-remind', ctx.user.id, 5, 60);
  const { campaignId } = await parseBody(req, z.object({ campaignId: z.string().uuid() }));
  const { data: camp } = await ctx.supabase.from('training_campaigns').select('*').eq('id', campaignId).eq('org_id', ctx.org.id).maybeSingle();
  if (!camp) throw new ApiError(404, 'Campaign not found');
  if (!isEmailConfigured()) return json({ emailed: 0, skipped: 0, notConfigured: true });
  const { data: rows, error } = await ctx.supabase.from('training_assignments').select('user_id, last_reminded_at, profile:profiles(full_name, email)').eq('campaign_id', campaignId).is('completed_at', null);
  if (error) throw new ApiError(500, error.message);
  const dayAgo = Date.now() - 86_400_000;
  let emailed = 0; let skipped = 0;
  const admin = getAdminClient();
  for (const r of (rows ?? []) as unknown as { user_id: string; last_reminded_at: string | null; profile: { full_name: string; email: string | null } | null }[]) {
    if (r.last_reminded_at && new Date(r.last_reminded_at).getTime() > dayAgo) { skipped++; continue; }
    if (!r.profile?.email) continue;
    const res = await sendEmail({ to: r.profile.email, subject: `Reminder: ${camp.title} is due ${camp.due_on}`,
      html: emailLayout(camp.title, `<p>Hi ${escapeHtml(r.profile.full_name.split(' ')[0] ?? '')},</p><p>Please complete <strong>${escapeHtml(camp.title)}</strong> by <strong>${camp.due_on}</strong>, then mark it complete in OrbitOS.</p>`, { label: 'Open OrbitOS', url: `${appUrl()}/compliance` }) });
    if (res.sent) {
      emailed++;
      await admin.from('training_assignments').update({ last_reminded_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('user_id', r.user_id);
    }
  }
  await audit(req, ctx.org.id, ctx.user.id, 'compliance.training_reminders', { type: 'training_campaign', id: campaignId }, { emailed, skipped });
  return json({ emailed, skipped, notConfigured: false });
});
