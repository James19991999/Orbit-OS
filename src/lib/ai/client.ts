import 'server-only';

/** Claude (Anthropic Messages API). Without ANTHROPIC_API_KEY the briefs fall back to a rule-based summary. */
export function isAIConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
}

export class AIError extends Error {}

export async function complete(opts: { system: string; prompt: string; maxTokens?: number }): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AIError('ANTHROPIC_API_KEY is not set');
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: aiModel(), max_tokens: opts.maxTokens ?? 1000, system: opts.system, messages: [{ role: 'user', content: opts.prompt }] }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string }; stop_reason?: string };
  if (!res.ok) throw new AIError(`Claude API ${res.status}: ${data.error?.message ?? 'request failed'}`);
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (!text) throw new AIError('Claude returned no text');
  return text;
}
