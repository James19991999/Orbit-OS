import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { runGrowth } from '@/lib/growth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly: trial follow-up emails, lapsed and failed payment follow-up, and (Mondays) the weekly founder email. */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const r = await runGrowth(getAdminClient());
  return json(r, r.errors.length ? 500 : 200);
});
