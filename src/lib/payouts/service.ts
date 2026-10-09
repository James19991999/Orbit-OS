import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appUrl } from '@/lib/env';
import { sendMoneyInitiate, sendMoneyApprove, sendMoneyStatus, txOutcome, batchDone, IntaSendError, type SendMoneyBatch } from '@/lib/intasend/client';

export { MAX_LINES, MIN_MINOR, MAX_MINOR, validateLines, parsePayoutCsv, type LineInput, type LineError } from './lines';

type Admin = SupabaseClient;

/** Approves (as a second person) and sends the batch to IntaSend. Callers must have checked role + MFA. */
export async function approveAndSend(admin: Admin, batchId: string, approverId: string): Promise<{ status: string; reason?: string }> {
  // Claim the batch atomically: only a draft can be approved, only once, never by its creator.
  const { data: claimed, error } = await admin.from('payout_batches')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', batchId).eq('status', 'draft').neq('created_by', approverId).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) return { status: 'refused', reason: 'This batch is no longer a draft, or you created it (a second person must approve).' };

  const { data: lines } = await admin.from('payout_lines').select('id, name, phone, amount_minor, narrative').eq('batch_id', batchId).order('id');
  if (!lines?.length) {
    await admin.from('payout_batches').update({ status: 'failed', failure_reason: 'No lines to pay' }).eq('id', batchId);
    return { status: 'failed', reason: 'No lines to pay' };
  }
  await admin.from('payout_batches').update({ status: 'processing', submitted_at: new Date().toISOString() }).eq('id', batchId);

  let initiated: SendMoneyBatch;
  try {
    initiated = await sendMoneyInitiate({
      transactions: lines.map((l) => ({ name: l.name, account: l.phone, amount: Math.round(Number(l.amount_minor) / 100), narrative: (l.narrative || 'Salary').slice(0, 22) })),
      callbackUrl: `${appUrl()}/api/webhooks/intasend`,
    });
  } catch (e) {
    // Nothing was created at IntaSend, so no money moved.
    const reason = e instanceof IntaSendError ? e.message : 'IntaSend could not be reached';
    await admin.from('payout_batches').update({ status: 'failed', failure_reason: reason }).eq('id', batchId);
    return { status: 'failed', reason };
  }
  await admin.from('payout_batches').update({ provider_tracking_id: initiated.tracking_id, provider_status: initiated.status ?? null }).eq('id', batchId);
  try {
    const approved = await sendMoneyApprove(initiated);
    await admin.from('payout_batches').update({ provider_status: approved.status ?? null }).eq('id', batchId);
  } catch (e) {
    // The batch exists at IntaSend but may not be released; keep it "processing" so the status sync settles it.
    await admin.from('payout_batches').update({ failure_reason: `Release step failed: ${(e as Error).message}. Check the IntaSend dashboard.` }).eq('id', batchId);
  }
  return { status: (await syncBatch(admin, batchId)).status };
}

/** Pulls the batch status from IntaSend and updates lines + batch. Idempotent; safe to run repeatedly. */
export async function syncBatch(admin: Admin, batchId: string): Promise<{ status: string }> {
  const { data: b } = await admin.from('payout_batches').select('id, org_id, status, provider_tracking_id, created_by, title').eq('id', batchId).maybeSingle();
  if (!b) return { status: 'not_found' };
  if (b.status !== 'processing' || !b.provider_tracking_id) return { status: b.status };
  let remote: SendMoneyBatch;
  try { remote = await sendMoneyStatus(b.provider_tracking_id); } catch { return { status: b.status }; }
  const { done, failedEarly } = batchDone(remote);
  const { data: lines } = await admin.from('payout_lines').select('id, phone, amount_minor, status').eq('batch_id', batchId).order('id');
  const txs = remote.transactions ?? [];
  let sent = 0; let failed = 0; let paidMinor = 0;
  for (const [i, l] of (lines ?? []).entries()) {
    // Match by account (phone); fall back to position when IntaSend omits the account.
    const tx = txs.find((t) => String(t.account ?? '').replace(/\D/g, '') === l.phone && Math.round(Number(t.amount) * 100) === Number(l.amount_minor)) ?? txs[i];
    const outcome = failedEarly ? 'failed' : tx ? txOutcome(tx, done) : done ? 'failed' : 'pending';
    if (outcome === 'sent') { sent++; paidMinor += Number(l.amount_minor); } else if (outcome === 'failed') failed++;
    if (outcome !== 'pending' && l.status !== outcome) {
      await admin.from('payout_lines').update({ status: outcome, provider_ref: tx?.transaction_id ?? null, failure_reason: outcome === 'failed' ? (tx?.status_description || tx?.status || 'Failed') : null }).eq('id', l.id);
    }
  }
  if (!done) { await admin.from('payout_batches').update({ provider_status: remote.status ?? null }).eq('id', batchId); return { status: 'processing' }; }
  const status = failed === 0 ? 'completed' : sent === 0 ? 'failed' : 'partially_failed';
  // Conditional update so two concurrent syncs can't both record the payroll run.
  const { data: fin } = await admin.from('payout_batches').update({ status, provider_status: remote.status ?? null, completed_at: new Date().toISOString(), failure_reason: failedEarly ? `IntaSend: ${remote.status}` : null })
    .eq('id', batchId).eq('status', 'processing').select('id').maybeSingle();
  if (fin && paidMinor > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: run } = await admin.from('payroll_runs').insert({ org_id: b.org_id, period: today.slice(0, 7), country_count: 1, total_minor: paidMinor, currency: 'KES', provider_label: 'M-Pesa (IntaSend)', status: 'settled', paid_on: today }).select('id').single();
    if (run) await admin.from('payout_batches').update({ payroll_run_id: run.id }).eq('id', batchId);
    await admin.from('notifications').insert({ org_id: b.org_id, user_id: b.created_by, kind: 'payout', title: `Payout "${b.title}" ${status === 'completed' ? 'completed' : 'finished with failures'}`, body: `${sent} paid, ${failed} failed`, link: `/operations?tab=finance#payouts` });
  }
  return { status };
}
