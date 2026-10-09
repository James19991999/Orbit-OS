// Local stand-in for the WhatsApp Cloud API, used ONLY by end-to-end tests.
//   POST /v21.0/:phoneNumberId/messages   → records the message, returns { messages: [{ id }] }
//   GET  /__sent?to=2547…                 → messages sent to that number (newest last)
//   POST /__inbound { from, text } | { from, payload }
//                                          → sends a correctly signed webhook to the app, as Meta would
// Set WA_MOCK_FAIL_TO=2547… to make sends to that number fail.
import http from 'node:http';
import { createHmac } from 'node:crypto';
const PORT = Number(process.env.PORT || 54410);
const APP = process.env.APP_URL || 'http://localhost:3000';
const SECRET = process.env.APP_SECRET || 'local-wa-app-secret';
const TOKEN = process.env.TOKEN || 'local-wa-token';
const sent = [];
let n = 0;
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const read = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && /^\/v\d+\.\d+\/[^/]+\/messages$/.test(url.pathname)) {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: { message: 'Invalid OAuth access token' } });
    const b = await read(req);
    if (b.messaging_product !== 'whatsapp' || !b.to) return send(res, 400, { error: { message: 'bad request' } });
    if (process.env.WA_MOCK_FAIL_TO && b.to === process.env.WA_MOCK_FAIL_TO) return send(res, 400, { error: { message: 'Recipient phone number not in allowed list' } });
    const id = `wamid.MOCK${++n}`;
    sent.push({ id, at: Date.now(), ...b });
    return send(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: b.to, wa_id: b.to }], messages: [{ id }] });
  }
  if (req.method === 'GET' && url.pathname === '/__sent') {
    const to = url.searchParams.get('to');
    return send(res, 200, sent.filter((m) => !to || m.to === to));
  }
  if (req.method === 'POST' && url.pathname === '/__inbound') {
    const b = await read(req);
    const msg = { from: b.from, id: b.id || `wamid.IN${Date.now()}${Math.random().toString(36).slice(2, 6)}`, timestamp: String(Math.floor(Date.now() / 1000)),
      ...(b.payload ? { type: 'button', button: { payload: b.payload, text: b.buttonText || 'Approve' } } : { type: 'text', text: { body: b.text } }) };
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'MOCK' }, messages: [msg] } }] }] });
    const sig = 'sha256=' + createHmac('sha256', b.badSignature ? 'wrong' : SECRET).update(body).digest('hex');
    const r = await fetch(`${APP}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
    return send(res, 200, { status: r.status, body: await r.text(), id: msg.id });
  }
  send(res, 404, { error: { message: 'not found' } });
}).listen(PORT, () => console.log(`whatsapp mock on :${PORT}`));
