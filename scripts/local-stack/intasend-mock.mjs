// Local stand-in for IntaSend used ONLY by end-to-end tests. Mirrors the request/response shapes the app uses:
//   POST /api/v1/checkout/              → { id, url }           (hosted page at /pay/:ref completes + fires webhook)
//   POST /api/v1/payment/mpesa-stk-push/ → { invoice: { invoice_id, state } }  (auto-completes after ~4s)
//   POST /api/v1/payment/status/         → { invoice: { invoice_id, state, api_ref } }
// Set INTASEND_MOCK_FAIL_PHONE=254700000000 to make that phone's STK push fail.
import http from 'node:http';
const PORT = Number(process.env.PORT || 54400);
const APP = process.env.APP_URL || 'http://localhost:3000';
const CHALLENGE = process.env.CHALLENGE || 'local-challenge';
const invoices = new Map(); // invoice_id -> { api_ref, state, created, redirect, phone }
let n = 0;
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const read = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
async function webhook(id) {
  const inv = invoices.get(id);
  await fetch(`${APP}/api/webhooks/intasend`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoice_id: id, state: inv.state, api_ref: inv.api_ref, challenge: CHALLENGE, value: inv.value }) }).then((r) => console.log('webhook', id, r.status)).catch((e) => console.log('webhook failed', e.message));
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/api/v1/checkout/') {
    const b = await read(req);
    if (!req.headers['x-intasend-public-api-key']) return send(res, 401, { detail: 'missing public key' });
    const id = `INV-MOCK-${++n}`;
    invoices.set(id, { api_ref: b.api_ref, state: 'PENDING', redirect: b.redirect_url, value: b.amount });
    return send(res, 200, { id: `CO-${n}`, url: `http://localhost:${PORT}/pay/${id}`, signature: 'mock' });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/payment/mpesa-stk-push/') {
    if (!String(req.headers.authorization || '').startsWith('Bearer ')) return send(res, 401, { detail: 'missing secret' });
    const b = await read(req);
    const id = `INV-MOCK-${++n}`;
    const fail = process.env.INTASEND_MOCK_FAIL_PHONE && b.phone_number === process.env.INTASEND_MOCK_FAIL_PHONE;
    invoices.set(id, { api_ref: b.api_ref, state: 'PENDING', value: b.amount, phone: b.phone_number });
    setTimeout(() => { const i = invoices.get(id); i.state = fail ? 'FAILED' : 'COMPLETE'; void webhook(id); }, 4000);
    return send(res, 200, { invoice: { invoice_id: id, state: 'PENDING', api_ref: b.api_ref } });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/payment/status/') {
    const b = await read(req);
    const inv = invoices.get(b.invoice_id);
    if (!inv) return send(res, 404, { detail: 'not found' });
    return send(res, 200, { invoice: { invoice_id: b.invoice_id, state: inv.state, api_ref: inv.api_ref, value: inv.value, failed_reason: inv.state === 'FAILED' ? 'Request cancelled by user' : null } });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/pay/')) {
    const id = url.pathname.slice(5);
    const inv = invoices.get(id);
    if (!inv) { res.writeHead(404); return res.end('unknown'); }
    inv.state = 'COMPLETE';
    await webhook(id);
    res.writeHead(302, { location: inv.redirect || APP });
    return res.end();
  }
  send(res, 404, { detail: 'mock: unknown route' });
}).listen(PORT, () => console.log(`IntaSend mock on :${PORT}`));
