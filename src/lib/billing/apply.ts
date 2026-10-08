import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeState, type IntaSendState } from '@/lib/intasend/client';

/**
 * Routes a confirmed IntaSend state to the right atomic RPC by api_ref prefix:
 *   orb_<orgId>_<nonce>  → platform subscription (apply_intasend_payment)
 *   inv_<invoiceId>      → client invoice (apply_invoice_payment, COMPLETE only)
 */
export async function applyPaymentState(admin: SupabaseClient, apiRef: string, stateRaw: unknown, invoiceId: string | null, raw: unknown): Promise<string> {
  const state = normalizeState(stateRaw);
  if (!state) return 'ignored_state';
  if (apiRef.startsWith('orb_')) {
    const { data, error } = await admin.rpc('apply_intasend_payment', { p_api_ref: apiRef, p_state: state, p_invoice_id: invoiceId, p_raw: raw ?? {} });
    if (error) throw new Error(error.message);
    return String(data);
  }
  if (apiRef.startsWith('inv_')) {
    if (state !== 'COMPLETE') return `invoice_${state.toLowerCase()}`;
    const id = apiRef.slice(4);
    if (!/^[0-9a-f-]{36}$/.test(id)) return 'bad_ref';
    const { data, error } = await admin.rpc('apply_invoice_payment', { p_invoice: id, p_raw: raw ?? {} });
    if (error) throw new Error(error.message);
    return String(data);
  }
  return 'unknown_ref';
}

export type { IntaSendState };
