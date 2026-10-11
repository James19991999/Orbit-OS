import 'server-only';
import { ETIMS_BASE } from './compose';

export type EtimsEnv = 'sandbox' | 'production';
export interface EtimsEnvelope<T = Record<string, unknown>> { resultCd: string; resultMsg: string; resultDt?: string; data?: T | null }

export class EtimsNetworkError extends Error {}

/** ETIMS_BASE_URL overrides KRA's URL (used by the local test mock). */
function baseUrl(env: EtimsEnv): string {
  return (process.env.ETIMS_BASE_URL || ETIMS_BASE[env]).replace(/\/$/, '');
}

/**
 * POSTs to an OSCU endpoint. KRA's spec puts tin/bhfId/cmcKey in the body; some deployments read them from
 * headers, so both are sent. Network failures and non-JSON answers throw EtimsNetworkError: the caller
 * can't know whether KRA received the request, so it must retry with the same invoice number.
 */
export async function etimsPost<T = Record<string, unknown>>(
  env: EtimsEnv, path: string, auth: { tin: string; bhfId: string; cmcKey?: string | null }, body: Record<string, unknown>,
): Promise<EtimsEnvelope<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json', tin: auth.tin, bhfId: auth.bhfId };
  if (auth.cmcKey) headers.cmcKey = auth.cmcKey;
  let res: Response;
  try {
    res = await fetch(`${baseUrl(env)}${path}`, {
      method: 'POST', headers,
      body: JSON.stringify({ tin: auth.tin, bhfId: auth.bhfId, ...(auth.cmcKey ? { cmcKey: auth.cmcKey } : {}), ...body }),
      signal: AbortSignal.timeout(30_000), cache: 'no-store',
    });
  } catch (e) {
    throw new EtimsNetworkError(`Couldn't reach KRA eTIMS: ${(e as Error).message}`);
  }
  const text = await res.text();
  let env2: EtimsEnvelope<T>;
  try { env2 = JSON.parse(text) as EtimsEnvelope<T>; } catch { throw new EtimsNetworkError(`KRA eTIMS answered HTTP ${res.status} without a result`); }
  if (typeof env2?.resultCd !== 'string') throw new EtimsNetworkError(`KRA eTIMS answered HTTP ${res.status} without a result code`);
  return env2;
}

/** §3.3.1.1 Device initialisation: returns the communication key (cmcKey) and branch details. */
export async function initializeDevice(env: EtimsEnv, tin: string, bhfId: string, dvcSrlNo: string) {
  const r = await etimsPost<{ info?: Record<string, string> }>(env, '/selectInitOsdcInfo', { tin, bhfId }, { dvcSrlNo });
  const info = r.data?.info;
  return { ok: r.resultCd === '000' && !!info?.cmcKey, resultCd: r.resultCd, resultMsg: r.resultMsg,
    cmcKey: info?.cmcKey ?? null, tradeName: info?.tradeNm ?? null, branchName: info?.bhfNm ?? null, sdcId: info?.sdcId ?? null, mrcNo: info?.mrcNo ?? null };
}

/** §3.3.3.1 Item classification list (thousands of rows; cached in etims_item_classes). */
export async function fetchItemClasses(env: EtimsEnv, auth: { tin: string; bhfId: string; cmcKey: string }) {
  const r = await etimsPost<{ itemClsList?: { itemClsCd: string; itemClsNm: string; taxTyCd?: string | null; useYn?: string }[] }>(
    env, '/selectItemClsList', auth, { lastReqDt: '20200101000000' });
  if (r.resultCd !== '000' && r.resultCd !== '001') throw new Error(`KRA ${r.resultCd}: ${r.resultMsg}`);
  return (r.data?.itemClsList ?? []).filter((c) => c.useYn !== 'N');
}
