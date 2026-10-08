import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { isSlackWebhook } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

export const PUT = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  const { webhook_url } = await parseBody(req, z.object({ webhook_url: z.string().nullable() }));
  if (webhook_url === null) {
    const { error } = await ctx.supabase.from('integrations').delete().eq('org_id', ctx.org.id).eq('kind', 'slack_webhook');
    if (error) throw new ApiError(500, error.message);
  } else {
    if (!isSlackWebhook(webhook_url)) throw new ApiError(400, 'That is not a Slack incoming-webhook URL (https://hooks.slack.com/services/…)');
    const { error } = await ctx.supabase.from('integrations').upsert({ org_id: ctx.org.id, kind: 'slack_webhook', enabled: true, config: { webhook_url } }, { onConflict: 'org_id,kind' });
    if (error) throw new ApiError(500, error.message);
  }
  await audit(req, ctx.org.id, ctx.user.id, 'integration.updated', { type: 'integration', id: 'slack' }, { connected: webhook_url !== null });
  return json({ ok: true });
});
