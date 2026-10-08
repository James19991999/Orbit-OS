import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { computeOrgHealth } from '@/lib/data/health';
import type { Organization } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily: stores each workspace's health index so the dashboard can show "vs 2 weeks ago". */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const admin = getAdminClient();
  const { data, error } = await admin.from('organizations').select('*').eq('status', 'active');
  if (error) throw new Error(error.message);
  let n = 0;
  for (const org of (data ?? []) as Organization[]) {
    const h = await computeOrgHealth(admin, org);
    const { error: e } = await admin.from('health_snapshots').upsert({ org_id: org.id, taken_on: new Date().toISOString().slice(0, 10), score: h.score, components: h.components }, { onConflict: 'org_id,taken_on' });
    if (!e) n++;
  }
  return json({ snapshots: n });
});
