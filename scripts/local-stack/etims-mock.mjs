// Local stand-in for KRA eTIMS OSCU, used ONLY by end-to-end tests. Mirrors the request/response shapes of
// KRA's OSCU specification v2.0 and checks what KRA is strict about: device key, registered items,
// consecutive invoice numbers, and VAT arithmetic that ties to the cent.
//   POST /etims-api/selectInitOsdcInfo | selectItemClsList | saveItem | saveTrnsSalesOsdc
//   GET  /__state                 → devices, items and received sales
//   POST /__fail {mode}           → 'down' (HTTP 503, no JSON), 'reject' (910), 'ack_then_fail' (records the next
//                                    sale, then answers 503 as if the reply was lost), or null
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT || 54430);
const devices = new Map();  // tin|bhf → { serial, cmcKey, items: Set, lastInvcNo, sales: Map<invcNo, sale> }
let failMode = null;
const RATES = { A: 0, B: 16, C: 0, D: 0, E: 8 };
const CLASSES = [
  ['8111150000', 'Computer programming services'], ['8111180000', 'Software maintenance and support'], ['8010150000', 'Management advisory services'],
  ['8014150000', 'Market research'], ['8011150000', 'Human resources services'], ['8410150000', 'Accounting services'],
  ['8016150000', 'Business administration services'], ['5059690800', 'Test item classification'],
];
const now14 = () => new Date(Date.now() + 3 * 3600_000).toISOString().replace(/\D/g, '').slice(0, 14);
const send = (res, body, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const ok = (data = null) => ({ resultCd: '000', resultMsg: 'It is succeeded', resultDt: now14(), data });
const err = (cd, msg) => ({ resultCd: cd, resultMsg: msg, resultDt: now14(), data: null });
const read = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r(null); } }); });
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pin = (v) => typeof v === 'string' && /^[A-Z][0-9]{9}[A-Z]$/.test(v);

function checkSale(b, dev) {
  if (!['S', 'R'].includes(b.rcptTyCd) || b.salesSttsCd !== '02' || !/^\d{14}$/.test(b.cfmDt ?? '') || !/^\d{8}$/.test(b.salesDt ?? '')) return 'header codes or dates are invalid';
  if (b.custTin && !pin(b.custTin)) return 'custTin is not a valid PIN';
  if (!Array.isArray(b.itemList) || b.itemList.length !== b.totItemCnt) return 'totItemCnt does not match itemList';
  const sums = { A: [0, 0], B: [0, 0], C: [0, 0], D: [0, 0], E: [0, 0] };
  for (const it of b.itemList) {
    if (!dev.items.has(it.itemCd)) return `item ${it.itemCd} is not registered`;
    if (!(it.taxTyCd in RATES)) return 'invalid taxTyCd';
    if (r2(it.prc * it.qty) !== r2(it.splyAmt) || r2(it.splyAmt - it.dcAmt) !== r2(it.taxblAmt) || r2(it.taxblAmt) !== r2(it.totAmt)) return 'line amounts do not tie';
    const rate = RATES[it.taxTyCd];
    if (r2((it.taxblAmt * rate) / (100 + rate)) !== r2(it.totTaxAmt)) return `line tax ${it.totTaxAmt} should be ${r2((it.taxblAmt * rate) / (100 + rate))}`;
    sums[it.taxTyCd][0] += it.taxblAmt; sums[it.taxTyCd][1] += it.totTaxAmt;
  }
  let tb = 0, tx = 0;
  for (const t of Object.keys(RATES)) {
    if (r2(b[`taxblAmt${t}`]) !== r2(sums[t][0]) || r2(b[`taxAmt${t}`]) !== r2(sums[t][1]) || b[`taxRt${t}`] !== RATES[t]) return `totals for tax type ${t} do not tie`;
    tb += sums[t][0]; tx += sums[t][1];
  }
  if (r2(b.totTaxblAmt) !== r2(tb) || r2(b.totTaxAmt) !== r2(tx) || r2(b.totAmt) !== r2(tb)) return 'invoice totals do not tie';
  if (b.rcptTyCd === 'R') {
    const orig = dev.sales.get(b.orgInvcNo);
    if (!orig || orig.rcptTyCd !== 'S') return 'orgInvcNo does not refer to a sale';
    if (r2(orig.totAmt) < r2(b.totAmt)) return 'credit note is larger than the sale';
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/__state') {
    return send(res, [...devices.entries()].map(([k, d]) => ({ key: k, serial: d.serial, items: [...d.items], lastInvcNo: d.lastInvcNo, sales: [...d.sales.values()] })));
  }
  if (req.method === 'POST' && url.pathname === '/__fail') { failMode = (await read(req))?.mode ?? null; return send(res, { failMode }); }
  if (req.method === 'POST' && url.pathname === '/__reset') { devices.clear(); failMode = null; return send(res, { ok: true }); }
  if (req.method !== 'POST' || !url.pathname.startsWith('/etims-api/')) return send(res, { error: 'not found' }, 404);
  if (failMode === 'down') { res.writeHead(503, { 'content-type': 'text/html' }); return res.end('<html>Service Unavailable</html>'); }
  const b = await read(req);
  if (!b) return send(res, err('911', 'There is no request full text'));
  const path = url.pathname.slice('/etims-api'.length);
  const key = `${b.tin}|${b.bhfId}`;
  if (!pin(b.tin) || !/^\d{2}$/.test(b.bhfId ?? '')) return send(res, err('900', 'There is no Header information'));

  if (path === '/selectInitOsdcInfo') {
    if (!b.dvcSrlNo || String(b.dvcSrlNo).startsWith('BAD')) return send(res, err('901', 'It is not valid device'));
    const d = devices.get(key);
    if (d && d.serial === b.dvcSrlNo) return send(res, err('902', 'This device is installed'));
    const cmcKey = randomBytes(24).toString('hex').toUpperCase();
    devices.set(key, { serial: b.dvcSrlNo, cmcKey, items: d?.items ?? new Set(), lastInvcNo: d?.lastInvcNo ?? 0, sales: d?.sales ?? new Map() });
    return send(res, ok({ info: { tin: b.tin, taxprNm: 'MOCK TRADERS LTD', bhfId: b.bhfId, bhfNm: 'Headquarter', bhfOpenDt: '20230101', prvncNm: 'NAIROBI', dstrtNm: 'NAIROBI', sctrNm: 'WESTLANDS', locDesc: null,
      hqYn: 'Y', mgrNm: 'Mock Manager', mgrTelNo: '0700000000', mgrEmail: 'mock@example.test', sdcId: 'KRACU0100000001', mrcNo: 'WIS00000001', dvcId: b.dvcSrlNo, intrlKey: null, signKey: null, cmcKey, lastPchsInvcNo: 0, lastSaleRcptNo: 0, lastInvcNo: 0, lastSaleInvcNo: 0, lastTrainInvcNo: 0, lastProfrmInvcNo: 0, lastCopyInvcNo: 0, tradeNm: 'MOCK TRADERS LTD' } }));
  }
  const dev = devices.get(key);
  const cmc = b.cmcKey ?? req.headers.cmckey;
  if (!dev || cmc !== dev.cmcKey) return send(res, err('901', 'It is not valid device'));
  if (failMode === 'reject' && path === '/saveTrnsSalesOsdc') return send(res, err('910', 'Request parameter error: custTin is not registered'));

  if (path === '/selectItemClsList') return send(res, ok({ itemClsList: CLASSES.map(([c, n]) => ({ itemClsCd: c, itemClsNm: n, itemClsLvl: 4, taxTyCd: 'B', mjrTgYn: 'N', useYn: 'Y' })) }));
  if (path === '/saveItem') {
    if (!/^KE\d[A-Z]{2}[A-Z]{2}\d{7}$/.test(b.itemCd ?? '') || !CLASSES.some(([c]) => c === b.itemClsCd) || b.itemTyCd !== '3' || !(b.taxTyCd in RATES)) return send(res, err('910', 'Request parameter error'));
    if (dev.items.has(b.itemCd)) return send(res, err('994', 'There is an overlapped Data'));
    dev.items.add(b.itemCd);
    return send(res, ok());
  }
  if (path === '/saveTrnsSalesOsdc') {
    if (dev.sales.has(b.invcNo)) return send(res, err('994', 'There is an overlapped Data'));
    if (b.invcNo !== dev.lastInvcNo + 1) return send(res, err('910', `Request parameter error: invcNo ${b.invcNo} is not the next number (${dev.lastInvcNo + 1})`));
    const problem = checkSale(b, dev);
    if (problem) return send(res, err('910', `Request parameter error: ${problem}`));
    dev.lastInvcNo = b.invcNo;
    const rcptNo = dev.sales.size + 1;
    const sale = { ...b, rcptNo };
    delete sale.cmcKey;
    dev.sales.set(b.invcNo, sale);
    if (failMode === 'ack_then_fail') { failMode = null; res.writeHead(503, { 'content-type': 'text/html' }); return res.end('<html>Gateway Timeout</html>'); }
    return send(res, ok({ curRcptNo: rcptNo, totRcptNo: rcptNo, intrlData: randomBytes(13).toString('hex').toUpperCase(), rcptSign: randomBytes(8).toString('hex').toUpperCase(), sdcDateTime: now14() }));
  }
  return send(res, err('999', 'There is an unknown error. Please ask it administrator'));
}).listen(PORT, () => console.log(`eTIMS mock on :${PORT}`));
