import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { loadReport } from '@/lib/reports/load';
import { reportToSlack } from '@/lib/reports/render';
import { slackWebhookFor, postToSlack } from '@/lib/integrations';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'] });
  await rateLimit('report-dispatch', ctx.user.id, 5, 60);
  const { period } = await parseBody(req, z.object({ period: z.enum(['quarter', 'last_quarter', 'ytd', 'last_30']) }));
  const url = await slackWebhookFor(ctx.supabase, ctx.org.id);
  if (!url) throw new ApiError(409, 'Connect Slack in Settings → Integrations first.');
  const r = await loadReport(ctx.supabase, ctx.org, period);
  const res = await postToSlack(url, reportToSlack(r, `${appUrl()}/reports?period=${period}`));
  if (!res.ok) throw new ApiError(502, res.error ?? 'Slack rejected the message');
  await audit(req, ctx.org.id, ctx.user.id, 'report.dispatched', { type: 'report', id: period }, { destination: 'slack' });
  return json({ ok: true });
});
