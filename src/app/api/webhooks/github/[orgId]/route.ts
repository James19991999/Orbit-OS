import { type NextRequest } from 'next/server';
import { json, rateLimit, clientIp, ApiError, handler } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { verifyGithubSignature, githubToActivity } from '@/lib/github';

export const dynamic = 'force-dynamic';

/** GitHub → Team Activity. Verified with the workspace's own secret (or GITHUB_WEBHOOK_SECRET as a fallback). */
export const POST = handler<{ params: Promise<{ orgId: string }> }>(async (req: NextRequest, route) => {
  const params = await route.params;
  await rateLimit('gh-webhook', clientIp(req), 120, 60);
  if (!/^[0-9a-f-]{36}$/.test(params.orgId)) throw new ApiError(404, 'Unknown workspace');
  const raw = await req.text();
  const admin = getAdminClient();
  const { data: integ } = await admin.from('integrations').select('config, enabled').eq('org_id', params.orgId).eq('kind', 'github').maybeSingle();
  const secret = (integ?.config as { secret?: string } | undefined)?.secret || process.env.GITHUB_WEBHOOK_SECRET || '';
  if (!integ?.enabled || !verifyGithubSignature(raw, req.headers.get('x-hub-signature-256'), secret)) throw new ApiError(401, 'Invalid signature');
  const event = req.headers.get('x-github-event');
  if (event === 'ping') return json({ ok: true, pong: true });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON'); }
  const a = githubToActivity(event, payload);
  if (!a) return json({ ok: true, ignored: event });
  const { error } = await admin.from('activity_events').insert({ org_id: params.orgId, actor_name: a.actor ? `@${a.actor}` : 'GitHub', kind: a.kind, title: a.title, body: a.body, link: a.link });
  if (error) throw new ApiError(500, error.message);
  return json({ ok: true });
});
