import 'server-only';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';

/** Last run of a background job, for the Founder Console. Best effort: never fails the job itself. */
export async function recordJobRun(job: string, status: number, ms: number, body: string) {
  if (!hasServiceRole()) return;
  try {
    let error: string | null = null;
    if (status >= 400) { try { error = (JSON.parse(body) as { error?: string }).error ?? body.slice(0, 300); } catch { error = body.slice(0, 300); } }
    await getAdminClient().rpc('record_job_run', { p_job: job, p_status: status, p_ms: Math.round(ms), p_summary: body.slice(0, 300), p_error: error });
  } catch (e) {
    console.error('[jobs] could not record run', job, (e as Error).message);
  }
}

/** An email or WhatsApp message that could not be delivered (kept 90 days). Best effort. */
export async function recordDeliveryFailure(channel: 'email' | 'whatsapp', error: string, context?: string) {
  if (!hasServiceRole()) return;
  try {
    await getAdminClient().from('delivery_failures').insert({ channel, error: error.slice(0, 500), context: context?.slice(0, 120) ?? null });
  } catch (e) {
    console.error('[delivery] could not record failure', (e as Error).message);
  }
}
