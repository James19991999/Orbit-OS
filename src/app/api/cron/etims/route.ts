import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { processDue } from '@/lib/etims/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly: retry invoices and receipts that KRA eTIMS hasn't accepted yet (KRA down, network errors). */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  return json(await processDue(getAdminClient()));
});
