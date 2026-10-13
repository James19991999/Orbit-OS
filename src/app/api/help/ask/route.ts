import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, rateLimit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { answerQuestion } from '@/lib/help/ask';
import { getLanguage } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3).max(500) }).strict();

/** Help centre assistant: signed-in members only, rate-limited, answers from the help articles. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext();
  await rateLimit('help-ask', ctx.user.id, 20, 3600);
  const { question } = await parseBody(req, Body);
  const lang = await getLanguage();
  const r = await answerQuestion(question, lang);
  // What people ask (and what the articles couldn't answer) shows the founder what to improve.
  const { error } = await getAdminClient().from('help_questions').insert({ org_id: ctx.org.id, user_id: ctx.user.id, language: lang, question, answered: r.answered, sources: r.sources });
  if (error) console.error('[help] could not record question', error.message);
  return json(r);
});
