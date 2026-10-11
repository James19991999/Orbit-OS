// Pure parts of the KRA eTIMS (OSCU) integration: PIN checks, VAT arithmetic and the sales payload.
// Field names and the VAT-inclusive arithmetic follow the worked example in KRA's OSCU specification v2.0
// (§3.3.6.1 saveTrnsSalesOsdc): line taxblAmt and totAmt are the tax-inclusive amount and
// totTaxAmt = taxblAmt × rate / (100 + rate). Codes come from §4 "Code Definition".
import { formatInTimeZone } from 'date-fns-tz';

export type TaxType = 'A' | 'B' | 'C' | 'D' | 'E';
/** §4.1 Tax type → rate (%). A exempt, B standard 16%, C zero-rated, D non-VAT, E reduced 8%. */
export const TAX_RATES: Record<TaxType, number> = { A: 0, B: 16, C: 0, D: 0, E: 8 };
export const TAX_TYPES = Object.keys(TAX_RATES) as TaxType[];

/** §4.11 Payment method. */
export const PAYMENT_TYPE = { cash: '01', credit: '02', cashCredit: '03', bankCheck: '04', card: '05', mobileMoney: '06', other: '07' } as const;
/** §4.12 Transaction progress: 02 = approved. */
const SALES_STATUS_APPROVED = '02';
/** §4.17 Credit note reason: 06 = refund (used when an invoice is voided). */
const REFUND_REASON_REFUND = '06';

export const ETIMS_BASE: Record<'sandbox' | 'production', string> = {
  sandbox: 'https://etims-api-sbx.kra.go.ke/etims-api',
  production: 'https://etims-api.kra.go.ke/etims-api',
};
const VERIFY_BASE: Record<'sandbox' | 'production', string> = {
  sandbox: 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData',
  production: 'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData',
};

/** KRA PIN: a letter, nine digits, a letter (A123456789Z). Returns the normalised PIN or null. */
export function normalizeKraPin(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  return /^[A-Z][0-9]{9}[A-Z]$/.test(v) ? v : null;
}

/** Rounds half up to 2 decimals (KRA rejects totals that are off by a cent). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** VAT contained in a tax-inclusive amount. */
export function vatOf(inclusive: number, type: TaxType): number {
  const r = TAX_RATES[type];
  return r ? round2((inclusive * r) / (100 + r)) : 0;
}

/** `KE` + item type (3 = service) + packaging unit + quantity unit (padded to 2 with X) + 7-digit sequence, as in KRA's sample KE1NTXU0000001. */
export function serviceItemCode(seq = 1): string {
  return `KE3NTXU${String(seq).padStart(7, '0')}`;
}

export const etimsDateTime = (d: Date) => formatInTimeZone(d, 'Africa/Nairobi', 'yyyyMMddHHmmss');
export const etimsDate = (d: Date) => formatInTimeZone(d, 'Africa/Nairobi', 'yyyyMMdd');

/** Link printed as a QR code on fiscal invoices: KRA's public receipt check page. */
export function verifyUrl(env: 'sandbox' | 'production', tin: string, bhfId: string, rcptSign: string): string {
  return `${VERIFY_BASE[env]}?Data=${encodeURIComponent(`${tin}${bhfId}${rcptSign}`)}`;
}

export interface SaleInput {
  kind: 'sale' | 'credit_note';
  tin: string;
  bhfId: string;
  invcNo: number;
  orgInvcNo?: number;            // credit notes: the original sale's invcNo
  tradeInvoiceNo: string;
  customerName?: string | null;
  customerPin?: string | null;
  amountMinor: number;           // VAT-inclusive, KES cents
  taxType: TaxType;
  paymentType: string;
  itemCode: string;
  itemClassCode: string;
  itemName: string;
  tradeName?: string | null;
  at: Date;
  user: { id: string; name: string };
}

export interface SalePayload extends Record<string, unknown> {
  invcNo: number;
  totAmt: number;
  totTaxAmt: number;
  itemList: Record<string, unknown>[];
}

/** One-line sale or credit note (OrbitOS invoices and plan payments carry a single service line). */
export function buildSalePayload(i: SaleInput): SalePayload {
  const total = round2(i.amountMinor / 100);
  const tax = vatOf(total, i.taxType);
  const per = (field: 'taxblAmt' | 'taxRt' | 'taxAmt') => Object.fromEntries(TAX_TYPES.map((t) => [
    `${field}${t}`, field === 'taxRt' ? TAX_RATES[t] : t !== i.taxType ? 0 : field === 'taxblAmt' ? total : tax,
  ]));
  const now = etimsDateTime(i.at);
  const credit = i.kind === 'credit_note';
  const cut = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
  const pin = normalizeKraPin(i.customerPin);
  return {
    tin: i.tin, bhfId: i.bhfId,
    trdInvcNo: i.tradeInvoiceNo.slice(0, 50),
    invcNo: i.invcNo,
    orgInvcNo: credit ? i.orgInvcNo ?? 0 : 0,
    custTin: pin, custNm: cut(i.customerName, 60),
    salesTyCd: 'N',                    // §4.9 normal (not copy, training or proforma)
    rcptTyCd: credit ? 'R' : 'S',      // §4.10 sale / credit note
    pmtTyCd: i.paymentType,
    salesSttsCd: SALES_STATUS_APPROVED,
    cfmDt: now, salesDt: etimsDate(i.at),
    stockRlsDt: null, cnclReqDt: null, cnclDt: null,
    rfdDt: credit ? now : null, rfdRsnCd: credit ? REFUND_REASON_REFUND : null,
    totItemCnt: 1,
    ...per('taxblAmt'), ...per('taxRt'), ...per('taxAmt'),
    totTaxblAmt: total, totTaxAmt: tax, totAmt: total,
    prchrAcptcYn: 'N', remark: null,
    regrId: i.user.id.slice(0, 20), regrNm: i.user.name.slice(0, 60), modrId: i.user.id.slice(0, 20), modrNm: i.user.name.slice(0, 60),
    receipt: { custTin: pin, custMblNo: null, rcptPbctDt: now, trdeNm: cut(i.tradeName, 20), adrs: null, topMsg: null, btmMsg: null, prchrAcptcYn: 'N' },
    itemList: [{
      itemSeq: 1, itemCd: i.itemCode, itemClsCd: i.itemClassCode, itemNm: i.itemName.slice(0, 200), bcd: null,
      pkgUnitCd: 'NT', pkg: 1, qtyUnitCd: 'U', qty: 1,
      prc: total, splyAmt: total, dcRt: 0, dcAmt: 0,
      isrccCd: null, isrccNm: null, isrcRt: null, isrcAmt: null,
      taxTyCd: i.taxType, taxblAmt: total, totTaxAmt: tax, totAmt: total,
    }],
  };
}

/** §3.3.3.2 saveItem for the one service item OrbitOS sells on a workspace's behalf. */
export function buildItemPayload(i: { tin: string; bhfId: string; itemCode: string; itemClassCode: string; itemName: string; taxType: TaxType; user: { id: string; name: string } }) {
  return {
    tin: i.tin, bhfId: i.bhfId,
    itemCd: i.itemCode, itemClsCd: i.itemClassCode, itemTyCd: '3', itemNm: i.itemName.slice(0, 200), itemStdNm: null,
    orgnNatCd: 'KE', pkgUnitCd: 'NT', qtyUnitCd: 'U', taxTyCd: i.taxType, btchNo: null, bcd: null,
    dftPrc: 0, grpPrcL1: 0, grpPrcL2: 0, grpPrcL3: 0, grpPrcL4: 0, grpPrcL5: 0, addInfo: null, sftyQty: null,
    isrcAplcbYn: 'N', useYn: 'Y',
    regrId: i.user.id.slice(0, 20), regrNm: i.user.name.slice(0, 60), modrId: i.user.id.slice(0, 20), modrNm: i.user.name.slice(0, 60),
  };
}

/**
 * What to do with a KRA result code. 000 accepted; 994 "overlapped data" means KRA already holds this
 * invoice number (an earlier attempt got through), so the number is used; 9xx (other than 994/999) are
 * validation errors that won't pass on retry; anything else is worth retrying.
 */
export function classifyResult(code: string | null | undefined): 'accepted' | 'duplicate' | 'rejected' | 'retry' {
  if (code === '000') return 'accepted';
  if (code === '994') return 'duplicate';
  if (code && /^9\d\d$/.test(code) && code !== '999') return 'rejected';
  return 'retry';
}

/** Back-off for retries: 1, 5, 15, 60 minutes, then every 3 hours. */
export function nextRetryDelayMs(attempts: number): number {
  return [1, 5, 15, 60][attempts - 1] !== undefined ? [1, 5, 15, 60][attempts - 1] * 60_000 : 3 * 3_600_000;
}
