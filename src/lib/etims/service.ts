import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets';
import { etimsPost, initializeDevice, fetchItemClasses, EtimsNetworkError, type EtimsEnv } from './client';
import {
  buildSalePayload, buildItemPayload, classifyResult, nextRetryDelayMs, normalizeKraPin, serviceItemCode,
  verifyUrl, PAYMENT_TYPE, type TaxType,
} from './compose';

type Admin = SupabaseClient;
const SYSTEM_USER = { id: 'orbitos', name: 'OrbitOS' };

export interface EtimsConfig {
  scope: string; org_id: string | null; environment: EtimsEnv; tin: string; bhf_id: string; device_serial: string;
  cmc_key_enc: string | null; trade_name: string | null; branch_name: string | null; sdc_id: string | null; mrc_no: string | null;
  tax_type: TaxType; item_cls_cd: string | null; item_cls_name: string | null; item_cd: string | null; item_name: string;
  status: 'not_connected' | 'needs_item' | 'active' | 'error'; last_error: string | null; initialized_at: string | null; updated_at: string;
}
export interface EtimsDocument {
  id: string; created_at: string; scope: string; org_id: string | null; kind: 'sale' | 'credit_note';
  invoice_id: string | null; billing_payment_id: string | null; original_id: string | null; trade_invoice_no: string;
  customer_name: string | null; customer_pin: string | null; amount_minor: number; tax_type: TaxType;
  status: 'queued' | 'submitted' | 'rejected' | 'skipped'; invc_no: number | null; attempts: number; next_attempt_at: string;
  result_cd: string | null; result_msg: string | null; rcpt_no: number | null; tot_rcpt_no: number | null; intrl_data: string | null;
  rcpt_sign: string | null; sdc_date_time: string | null; sdc_id: string | null; mrc_no: string | null; submitted_at: string | null;
}

/** What the UI may see about a configuration (never the communication key). */
export function publicConfig(c: EtimsConfig | null) {
  if (!c) return null;
  return { environment: c.environment, tin: c.tin, bhfId: c.bhf_id, deviceSerial: c.device_serial, tradeName: c.trade_name, branchName: c.branch_name,
    taxType: c.tax_type, itemClassCode: c.item_cls_cd, itemClassName: c.item_cls_name, itemCode: c.item_cd, itemName: c.item_name,
    status: c.status, lastError: c.last_error, initializedAt: c.initialized_at };
}
export type PublicEtimsConfig = NonNullable<ReturnType<typeof publicConfig>>;

/** The fiscal fields printed on an invoice or receipt, plus the KRA check link for the QR code. */
export function fiscalView(doc: EtimsDocument | null, cfg: Pick<EtimsConfig, 'environment' | 'tin' | 'bhf_id'> | null) {
  if (!doc || doc.status !== 'submitted' || !cfg) return null;
  return {
    invoiceNo: doc.invc_no, receiptNo: doc.rcpt_no, totalReceiptNo: doc.tot_rcpt_no, internalData: doc.intrl_data, signature: doc.rcpt_sign,
    sdcId: doc.sdc_id, mrcNo: doc.mrc_no, dateTime: doc.sdc_date_time, kind: doc.kind,
    verifyUrl: doc.rcpt_sign ? verifyUrl(cfg.environment, cfg.tin, cfg.bhf_id, doc.rcpt_sign) : null,
  };
}
export type FiscalView = NonNullable<ReturnType<typeof fiscalView>>;

export async function loadConfig(admin: Admin, scope: string): Promise<EtimsConfig | null> {
  const { data, error } = await admin.from('etims_configs').select('*').eq('scope', scope).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EtimsConfig | null) ?? null;
}

// ───────────────────────── Workspace set-up ─────────────────────────

/** Saves the device details and initialises it with KRA, which issues the communication key. */
export async function connectDevice(admin: Admin, scope: string, orgId: string | null,
  input: { environment: EtimsEnv; tin: string; bhfId: string; deviceSerial: string; taxType: TaxType; itemName?: string }, userId: string | null) {
  const tin = normalizeKraPin(input.tin);
  if (!tin) throw new UserError('Enter the KRA PIN as a letter, nine digits and a letter (e.g. P051234567X).');
  const existing = await loadConfig(admin, scope);
  const same = existing && existing.tin === tin && existing.bhf_id === input.bhfId && existing.device_serial === input.deviceSerial && existing.environment === input.environment;
  const init = await initializeDevice(input.environment, tin, input.bhfId, input.deviceSerial);
  // 902 "This device is installed": KRA won’t hand the key out twice. Keep the stored key if it is for this same device.
  const reuse = !init.ok && init.resultCd === '902' && same && existing?.cmc_key_enc;
  if (!init.ok && !reuse) {
    throw new UserError(init.resultCd === '902'
      ? 'KRA says this device is already initialised. Use the same details it was first set up with here, or ask KRA to reset the device.'
      : `KRA didn’t accept these details (${init.resultCd}: ${init.resultMsg}). Check the PIN, branch and device serial in KRA’s approval email.`);
  }
  const row = {
    scope, org_id: orgId, environment: input.environment, tin, bhf_id: input.bhfId, device_serial: input.deviceSerial,
    cmc_key_enc: reuse ? existing!.cmc_key_enc : encryptSecret(init.cmcKey!),
    trade_name: init.tradeName ?? existing?.trade_name ?? null, branch_name: init.branchName ?? existing?.branch_name ?? null,
    sdc_id: init.sdcId ?? existing?.sdc_id ?? null, mrc_no: init.mrcNo ?? existing?.mrc_no ?? null,
    tax_type: input.taxType, item_name: input.itemName?.trim() || existing?.item_name || 'Professional services',
    // A different device or PIN needs its item registered again.
    item_cd: same ? existing?.item_cd ?? null : null, item_cls_cd: same ? existing?.item_cls_cd ?? null : null, item_cls_name: same ? existing?.item_cls_name ?? null : null,
    status: same && existing?.item_cd ? 'active' : 'needs_item', last_error: null,
    initialized_at: new Date().toISOString(), updated_by: userId, updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from('etims_configs').upsert(row, { onConflict: 'scope' });
  if (error) throw new Error(error.message);
  await admin.from('etims_sequences').upsert({ scope }, { onConflict: 'scope', ignoreDuplicates: true });
  return (await loadConfig(admin, scope))!;
}

/** Registers the service item invoices are issued for (KRA requires items to exist before they are sold). */
export async function registerItem(admin: Admin, cfg: EtimsConfig, cls: { code: string; name: string }, itemName: string, userId: string | null) {
  if (!cfg.cmc_key_enc) throw new UserError('Connect the device first.');
  const itemCode = cfg.item_cd ?? serviceItemCode(1);
  const r = await etimsPost(cfg.environment, '/saveItem', { tin: cfg.tin, bhfId: cfg.bhf_id, cmcKey: decryptSecret(cfg.cmc_key_enc) },
    buildItemPayload({ tin: cfg.tin, bhfId: cfg.bhf_id, itemCode, itemClassCode: cls.code, itemName, taxType: cfg.tax_type, user: SYSTEM_USER }));
  // 994 "overlapped data": the item code already exists on this branch, which is what we want.
  if (r.resultCd !== '000' && r.resultCd !== '994') throw new UserError(`KRA didn’t register the item (${r.resultCd}: ${r.resultMsg}).`);
  const { error } = await admin.from('etims_configs').update({
    item_cd: itemCode, item_cls_cd: cls.code, item_cls_name: cls.name, item_name: itemName, status: 'active', last_error: null,
    updated_by: userId, updated_at: new Date().toISOString(),
  }).eq('scope', cfg.scope);
  if (error) throw new Error(error.message);
  return (await loadConfig(admin, cfg.scope))!;
}

/** Searches KRA's item classifications, downloading the list once per environment. */
export async function searchItemClasses(admin: Admin, cfg: EtimsConfig, q: string) {
  const { count } = await admin.from('etims_item_classes').select('code', { count: 'exact', head: true }).eq('environment', cfg.environment);
  if (!count) {
    if (!cfg.cmc_key_enc) throw new UserError('Connect the device first.');
    const list = await fetchItemClasses(cfg.environment, { tin: cfg.tin, bhfId: cfg.bhf_id, cmcKey: decryptSecret(cfg.cmc_key_enc) });
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000).map((c) => ({ environment: cfg.environment, code: c.itemClsCd, name: c.itemClsNm, tax_type: c.taxTyCd ?? null }));
      const { error } = await admin.from('etims_item_classes').upsert(chunk, { onConflict: 'environment,code' });
      if (error) throw new Error(error.message);
    }
  }
  const term = q.trim().replace(/[%_,()]/g, ' ').slice(0, 60);
  let query = admin.from('etims_item_classes').select('code, name').eq('environment', cfg.environment).order('name').limit(25);
  if (term) query = /^\d+$/.test(term) ? query.like('code', `${term}%`) : query.ilike('name', `%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as { code: string; name: string }[];
}

// ───────────────────────── Platform (OrbitOS's own receipts) ─────────────────────────

/** OrbitOS's own eTIMS device, configured only through environment variables. */
export function platformEnv() {
  const tin = normalizeKraPin(process.env.ETIMS_TIN);
  const serial = (process.env.ETIMS_DEVICE_SERIAL || '').trim();
  const cls = (process.env.ETIMS_ITEM_CLS_CD || '').trim();
  if (!tin || !serial || !/^\d{1,10}$/.test(cls)) return null;
  const tax = (process.env.ETIMS_TAX_TYPE || 'B').toUpperCase();
  return {
    tin, serial, itemClassCode: cls,
    environment: (process.env.ETIMS_ENV === 'production' ? 'production' : 'sandbox') as EtimsEnv,
    bhfId: /^\d{2}$/.test(process.env.ETIMS_BHF_ID || '') ? process.env.ETIMS_BHF_ID! : '00',
    taxType: (['A', 'B', 'C', 'D', 'E'].includes(tax) ? tax : 'B') as TaxType,
    itemName: process.env.ETIMS_ITEM_NAME || 'OrbitOS subscription',
  };
}

/** Makes sure the platform device is initialised and its item registered (both happen once, on first use). */
async function ensurePlatform(admin: Admin): Promise<EtimsConfig | null> {
  const env = platformEnv();
  if (!env) return null;
  let cfg = await loadConfig(admin, 'platform');
  const changed = !cfg || cfg.tin !== env.tin || cfg.device_serial !== env.serial || cfg.environment !== env.environment || cfg.bhf_id !== env.bhfId;
  if (changed || !cfg?.cmc_key_enc) {
    cfg = await connectDevice(admin, 'platform', null, { environment: env.environment, tin: env.tin, bhfId: env.bhfId, deviceSerial: env.serial, taxType: env.taxType, itemName: env.itemName }, null);
  }
  if (!cfg.item_cd || cfg.item_cls_cd !== env.itemClassCode) {
    cfg = await registerItem(admin, cfg, { code: env.itemClassCode, name: env.itemClassCode }, env.itemName, null);
  }
  return cfg;
}

// ───────────────────────── Queueing ─────────────────────────

/** A problem the person can fix (shown to them as a 400). */
export class UserError extends ApiError {
  constructor(message: string) { super(400, message); }
}

/** Called when a client invoice is sent. Returns the document (or why nothing was queued). */
export async function queueInvoiceSale(admin: Admin, invoice: { id: string; org_id: string; number: string; client_name: string; client_kra_pin: string | null; amount_minor: number; currency: string }) {
  const cfg = await loadConfig(admin, invoice.org_id);
  if (!cfg || cfg.status !== 'active') return { queued: false as const, reason: 'not_configured' as const };
  if (invoice.currency !== 'KES') return { queued: false as const, reason: 'currency' as const };
  const { data: existing } = await admin.from('etims_documents').select('id').eq('invoice_id', invoice.id).eq('kind', 'sale').neq('status', 'rejected').maybeSingle();
  if (!existing) {
    const { error } = await admin.from('etims_documents').insert({
      scope: cfg.scope, org_id: invoice.org_id, kind: 'sale', invoice_id: invoice.id, trade_invoice_no: invoice.number,
      customer_name: invoice.client_name, customer_pin: normalizeKraPin(invoice.client_kra_pin), amount_minor: invoice.amount_minor, tax_type: cfg.tax_type,
      request: { paymentType: PAYMENT_TYPE.credit },
    });
    if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
  }
  await processScope(admin, cfg.scope);
  return { queued: true as const, doc: await invoiceDocument(admin, invoice.id, 'sale') };
}

/** Called when a fiscalised invoice is voided: KRA has no cancel, so a credit note reverses the sale. */
export async function queueInvoiceCredit(admin: Admin, invoiceId: string) {
  const sale = await invoiceDocument(admin, invoiceId, 'sale');
  if (!sale || sale.status === 'rejected' || sale.status === 'skipped') return { queued: false as const };
  if (sale.status === 'queued' && sale.invc_no === null) {
    // Never reached KRA: nothing to reverse.
    await admin.from('etims_documents').update({ status: 'skipped', result_msg: 'Invoice voided before it reached KRA' }).eq('id', sale.id).eq('status', 'queued');
    return { queued: false as const };
  }
  const { error } = await admin.from('etims_documents').insert({
    scope: sale.scope, org_id: sale.org_id, kind: 'credit_note', invoice_id: invoiceId, original_id: sale.id,
    trade_invoice_no: `${sale.trade_invoice_no}-CN`, customer_name: sale.customer_name, customer_pin: sale.customer_pin,
    amount_minor: sale.amount_minor, tax_type: sale.tax_type, request: { paymentType: PAYMENT_TYPE.credit },
  });
  if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
  await processScope(admin, sale.scope);
  return { queued: true as const, doc: await invoiceDocument(admin, invoiceId, 'credit_note') };
}

/** Called after an OrbitOS plan payment is applied: a fiscal receipt from OrbitOS to the workspace. */
export async function queuePlatformReceipt(admin: Admin, apiRef: string) {
  const env = platformEnv();
  if (!env) return { queued: false as const, reason: 'not_configured' as const };
  const { data: p } = await admin.from('billing_payments').select('id, org_id, amount_minor, currency, method, state, api_ref, plan, period').eq('api_ref', apiRef).maybeSingle();
  if (!p || p.state !== 'COMPLETE') return { queued: false as const, reason: 'not_complete' as const };
  if (p.currency !== 'KES') return { queued: false as const, reason: 'currency' as const };
  const cfg = await ensurePlatform(admin);
  if (!cfg) return { queued: false as const, reason: 'not_configured' as const };
  const { data: org } = await admin.from('organizations').select('name, legal_name, kra_pin').eq('id', p.org_id).maybeSingle();
  const { error } = await admin.from('etims_documents').insert({
    // KRA allows 50 characters for the trader's invoice number; the payment id (36) fits, the api_ref doesn't.
    scope: 'platform', org_id: p.org_id, kind: 'sale', billing_payment_id: p.id, trade_invoice_no: p.id,
    customer_name: org?.legal_name || org?.name || null, customer_pin: org?.kra_pin ?? null, amount_minor: p.amount_minor, tax_type: cfg.tax_type,
    request: { paymentType: p.method === 'MPESA' ? PAYMENT_TYPE.mobileMoney : PAYMENT_TYPE.card },
  });
  if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
  await processScope(admin, 'platform');
  return { queued: true as const };
}

export async function invoiceDocument(admin: Admin, invoiceId: string, kind: 'sale' | 'credit_note'): Promise<EtimsDocument | null> {
  const { data } = await admin.from('etims_documents').select('*').eq('invoice_id', invoiceId).eq('kind', kind)
    .order('created_at', { ascending: false }).limit(1);
  return ((data ?? [])[0] as EtimsDocument | undefined) ?? null;
}

// ───────────────────────── Sending ─────────────────────────

/**
 * Sends a branch's queued documents to KRA, oldest first, one at a time under a lease, so invoice numbers stay
 * consecutive. A document whose send failed without an answer keeps its number and is retried first: KRA may
 * have received it (it then answers 994, which counts as accepted).
 */
export async function processScope(admin: Admin, scope: string, opts: { ignoreSchedule?: boolean; max?: number } = {}) {
  const token = randomUUID();
  const out = { sent: 0, rejected: 0, waiting: 0 };
  let cfg: EtimsConfig | null = null;
  try {
    cfg = scope === 'platform' ? await ensurePlatform(admin) : await loadConfig(admin, scope);
  } catch (e) {
    await admin.from('etims_configs').update({ last_error: (e as Error).message }).eq('scope', scope);
    return out;
  }
  if (!cfg || cfg.status !== 'active' || !cfg.cmc_key_enc || !cfg.item_cd || !cfg.item_cls_cd) return out;
  const cmcKey = decryptSecret(cfg.cmc_key_enc);
  for (let i = 0; i < (opts.max ?? 20); i++) {
    const next = await claim(admin, scope, token);
    if (next === null) { out.waiting++; break; }                      // another send holds the lease
    const { data: docs } = await admin.from('etims_documents').select('*').eq('scope', scope).eq('status', 'queued')
      .order('invc_no', { ascending: true, nullsFirst: false }).order('created_at').limit(1);
    const doc = (docs ?? [])[0] as EtimsDocument | undefined;
    if (!doc) { await release(admin, scope, token, false, next); break; }
    if (!opts.ignoreSchedule && Date.parse(doc.next_attempt_at) > Date.now()) { await release(admin, scope, token, false, next); out.waiting++; break; }
    let orgInvcNo: number | undefined;
    if (doc.kind === 'credit_note') {
      const { data: orig } = await admin.from('etims_documents').select('invc_no, status').eq('id', doc.original_id!).maybeSingle();
      if (!orig || orig.status !== 'submitted' || !orig.invc_no) { await release(admin, scope, token, false, next); out.waiting++; break; }
      orgInvcNo = Number(orig.invc_no);
    }
    const invcNo = doc.invc_no ?? next;
    const payload = buildSalePayload({
      kind: doc.kind, tin: cfg.tin, bhfId: cfg.bhf_id, invcNo, orgInvcNo, tradeInvoiceNo: doc.trade_invoice_no,
      customerName: doc.customer_name, customerPin: doc.customer_pin, amountMinor: doc.amount_minor, taxType: doc.tax_type,
      paymentType: ((doc as unknown as { request?: { paymentType?: string } }).request?.paymentType) ?? PAYMENT_TYPE.credit,
      itemCode: cfg.item_cd, itemClassCode: cfg.item_cls_cd, itemName: cfg.item_name, tradeName: cfg.trade_name, at: new Date(), user: SYSTEM_USER,
    });
    // Remember the number before sending, so a lost answer is retried with the same number.
    await admin.from('etims_documents').update({ invc_no: invcNo, attempts: doc.attempts + 1 }).eq('id', doc.id);
    let verdict: ReturnType<typeof classifyResult>; let resultCd: string | null = null; let resultMsg: string; let data: Record<string, unknown> = {};
    try {
      const r = await etimsPost(cfg.environment, '/saveTrnsSalesOsdc', { tin: cfg.tin, bhfId: cfg.bhf_id, cmcKey }, payload);
      resultCd = r.resultCd; resultMsg = r.resultMsg; data = (r.data ?? {}) as Record<string, unknown>;
      verdict = classifyResult(r.resultCd);
    } catch (e) {
      verdict = 'retry'; resultMsg = e instanceof EtimsNetworkError ? e.message : `Unexpected error: ${(e as Error).message}`;
    }
    const base = { result_cd: resultCd, result_msg: resultMsg.slice(0, 500), request: { ...payload, cmcKey: undefined, paymentType: payload.pmtTyCd } };
    if (verdict === 'accepted' || verdict === 'duplicate') {
      await admin.from('etims_documents').update({
        ...base, status: 'submitted', submitted_at: new Date().toISOString(), response: data,
        rcpt_no: num(data.curRcptNo), tot_rcpt_no: num(data.totRcptNo), intrl_data: str(data.intrlData), rcpt_sign: str(data.rcptSign),
        sdc_date_time: str(data.sdcDateTime), sdc_id: cfg.sdc_id, mrc_no: cfg.mrc_no,
      }).eq('id', doc.id);
      await release(admin, scope, token, true, invcNo);
      out.sent++;
      continue;
    }
    if (verdict === 'rejected') {
      await admin.from('etims_documents').update({ ...base, status: 'rejected', invc_no: null, response: data }).eq('id', doc.id);
      await release(admin, scope, token, false, invcNo);
      out.rejected++;
      if (['900', '901', '902', '903'].includes(resultCd ?? '')) {
        await admin.from('etims_configs').update({ status: 'error', last_error: `KRA ${resultCd}: ${resultMsg}` }).eq('scope', scope);
        break;
      }
      if (doc.org_id && scope !== 'platform') await notifyRejection(admin, doc, resultCd!, resultMsg);
      else console.error('[etims] platform receipt rejected', doc.trade_invoice_no, resultCd, resultMsg);
      continue;
    }
    // No usable answer: keep the number and try again later; stop so later documents keep their order.
    const attempts = doc.attempts + 1;
    await admin.from('etims_documents').update({ ...base, next_attempt_at: new Date(Date.now() + nextRetryDelayMs(attempts)).toISOString() }).eq('id', doc.id);
    await release(admin, scope, token, false, invcNo);
    out.waiting++;
    break;
  }
  return out;
}

/** Cron: every branch with documents due. */
export async function processDue(admin: Admin) {
  const { data } = await admin.from('etims_documents').select('scope').eq('status', 'queued').lte('next_attempt_at', new Date().toISOString()).limit(500);
  const scopes = [...new Set((data ?? []).map((d) => d.scope as string))];
  const totals = { scopes: scopes.length, sent: 0, rejected: 0, waiting: 0 };
  for (const s of scopes) {
    const r = await processScope(admin, s);
    totals.sent += r.sent; totals.rejected += r.rejected; totals.waiting += r.waiting;
  }
  return totals;
}

async function claim(admin: Admin, scope: string, token: string): Promise<number | null> {
  const { data, error } = await admin.rpc('etims_claim', { p_scope: scope, p_token: token });
  if (error) throw new Error(error.message);
  return data === null || data === undefined ? null : Number(data);
}
async function release(admin: Admin, scope: string, token: string, used: boolean, no: number) {
  await admin.rpc('etims_release', { p_scope: scope, p_token: token, p_used: used, p_no: no });
}
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

async function notifyRejection(admin: Admin, doc: EtimsDocument, code: string, msg: string) {
  const { data: owners } = await admin.from('memberships').select('user_id').eq('org_id', doc.org_id!).eq('status', 'active').in('role', ['owner', 'director']);
  if (!owners?.length) return;
  await admin.from('notifications').insert(owners.map((o) => ({
    org_id: doc.org_id, user_id: o.user_id, kind: 'etims',
    title: `KRA rejected ${doc.kind === 'credit_note' ? 'the credit note for' : 'invoice'} ${doc.trade_invoice_no}`,
    body: `${code}: ${msg}`.slice(0, 300), link: doc.invoice_id ? `/operations/invoices/${doc.invoice_id}` : '/settings?section=etims',
  })));
}
