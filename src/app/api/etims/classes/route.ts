import { handler, json, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { loadConfig, searchItemClasses } from '@/lib/etims/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Owner: search KRA's item classifications (e.g. "consult", "software"). */
export const GET = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'] });
  await rateLimit('etims-classes', ctx.user.id, 60, 60);
  const admin = getAdminClient();
  const cfg = await loadConfig(admin, ctx.org.id);
  if (!cfg?.cmc_key_enc) throw new ApiError(409, 'Connect your eTIMS device first.');
  return json({ results: await searchItemClasses(admin, cfg, req.nextUrl.searchParams.get('q') ?? '') });
});
