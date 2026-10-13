import { handler, json, requireCronSecret } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { runAutomations } from '@/lib/automations';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hourly: new-member checklists (safety net), invoice reminders, overdue nudges and escalation, handover reminders. */
export const GET = handler(async (req) => {
  requireCronSecret(req);
  const r = await runAutomations(getAdminClient());
  return json(r, (r.errors as string[]).length ? 500 : 200);
});
