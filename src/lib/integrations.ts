import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export function isSlackWebhook(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url);
}

export async function slackWebhookFor(sb: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await sb.from('integrations').select('config, enabled').eq('org_id', orgId).eq('kind', 'slack_webhook').maybeSingle();
  const url = (data?.config as { webhook_url?: string } | undefined)?.webhook_url;
  return data?.enabled && isSlackWebhook(url) ? url : null;
}

export async function postToSlack(url: string, payload: { text: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, error: `Slack responded ${res.status}: ${(await res.text()).slice(0, 120)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
