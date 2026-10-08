import { json } from '@/lib/api';
import { supabaseEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Real health check: is the database reachable, and how fast. */
export async function GET() {
  const env = supabaseEnv();
  if (!env) return json({ status: 'unconfigured' }, 503);
  const started = Date.now();
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/org_by_slug`, {
      method: 'POST',
      headers: { apikey: env.anonKey, authorization: `Bearer ${env.anonKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: 'health-check' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - started;
    return json({ status: res.ok ? 'ok' : 'degraded', latencyMs }, res.ok ? 200 : 503);
  } catch {
    return json({ status: 'degraded', latencyMs: Date.now() - started }, 503);
  }
}
