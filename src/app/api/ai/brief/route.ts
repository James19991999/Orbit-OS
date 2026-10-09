import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { getLanguage } from '@/i18n/server';
import { gatherFacts, writeBrief, saveBrief, periodKey } from '@/lib/ai/brief';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const Body = z.object({ kind: z.enum(['weekly', 'checkins']) }).strict();

/** "Write it now": owners and directors, when the owner has turned the chief of staff on. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  const { kind } = await parseBody(req, Body);
  if (!ctx.org.ai_enabled) throw new ApiError(409, 'The AI chief of staff is off for this workspace. The owner can turn it on.');
  await rateLimit('ai-brief', ctx.user.id, 6, 3600);
  const admin = getAdminClient();
  const { data: p } = await admin.from('profiles').select('timezone').eq('id', ctx.user.id).maybeSingle();
  const tz = (p?.timezone as string) || 'UTC';
  const lang = await getLanguage();
  const facts = await gatherFacts(admin, { id: ctx.org.id, name: ctx.org.name }, kind, tz);
  const b = await writeBrief(facts, lang, true);
  const saved = await saveBrief(admin, { org_id: ctx.org.id, user_id: ctx.user.id, kind, period_key: periodKey(kind, tz), language: lang, ...b });
  return json({ brief: saved });
});
