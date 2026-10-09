import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { isIntaSendConfigured } from '@/lib/intasend/client';
import { syncBatch } from '@/lib/payouts/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly safety net: settle payout batches still "processing" (IntaSend callbacks can be missed). */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  if (!isIntaSendConfigured()) return json({ skipped: 'IntaSend not configured' });
  const admin = getAdminClient();
  const { data, error } = await admin.from('payout_batches').select('id').eq('status', 'processing').limit(200);
  if (error) throw new Error(error.message);
  const results: Record<string, string> = {};
  for (const b of data ?? []) results[b.id as string] = (await syncBatch(admin, b.id as string)).status;
  return json({ checked: Object.keys(results).length, results });
});
