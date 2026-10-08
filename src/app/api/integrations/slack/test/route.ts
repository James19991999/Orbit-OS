import { handler, json, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { slackWebhookFor, postToSlack } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'] });
  await rateLimit('slack-test', ctx.user.id, 5, 60);
  const url = await slackWebhookFor(ctx.supabase, ctx.org.id);
  if (!url) throw new ApiError(409, 'Slack is not connected');
  const r = await postToSlack(url, { text: `:satellite: OrbitOS is connected to this channel for *${ctx.org.name}*.` });
  if (!r.ok) throw new ApiError(502, r.error ?? 'Slack rejected the test message');
  return json({ ok: true });
});
