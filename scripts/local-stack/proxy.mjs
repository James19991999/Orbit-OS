// Minimal Supabase-style gateway: /auth/v1 → GoTrue, /rest/v1 → PostgREST, /storage/v1 → storage-mock. Local testing only.
import http from 'node:http';
import { createRequire } from 'node:module';
const { WebSocketServer } = createRequire(import.meta.url)('ws');
import { handleStorage } from './storage-mock.mjs';
const routes = [['/auth/v1', 9999], ['/rest/v1', 3001]];
// GATEWAY_LATENCY_MS simulates the app and the database being in different regions (e.g. 90 for US ↔ Frankfurt).
// GATEWAY_LOG=1 prints each request with a timestamp, to count round trips per page.
const LATENCY = Number(process.env.GATEWAY_LATENCY_MS || 0);
const LOG = process.env.GATEWAY_LOG === '1';
const server = http.createServer((req, res) => {
  if (LOG) console.log(`${Date.now()} ${req.method} ${req.url.split('?')[0]}`);
  if (LATENCY && req.method !== 'OPTIONS') { req.pause(); setTimeout(() => { req.resume(); handle(req, res); }, LATENCY); return; }
  handle(req, res);
});
function handle(req, res) {
  const hit = routes.find(([p]) => req.url.startsWith(p));
  res.setHeader('access-control-allow-origin', req.headers.origin || '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-expose-headers', 'content-range, x-supabase-api-version');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url.startsWith('/storage/v1/')) return void handleStorage(req, res);
  if (!hit) { res.writeHead(501, { 'content-type': 'application/json' }); return res.end('{"message":"not available in local stack"}'); }
  const [prefix, port] = hit;
  const up = http.request({ host: '127.0.0.1', port, path: req.url.slice(prefix.length) || '/', method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (r) => {
    const headers = { ...r.headers };
    delete headers['access-control-allow-origin'];
    res.writeHead(r.statusCode, headers);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}

// Minimal Supabase Realtime stand-in: accepts channel joins (postgres_changes, presence) and heartbeats
// so the app sees a live connection, like production. It never pushes changes. Local testing only.
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/realtime/v1/websocket')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    let n = 0;
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      // realtime-js speaks Phoenix serializer v2 (arrays) or v1 (objects); answer in kind.
      const arr = Array.isArray(m);
      const [joinRef, ref, topic, event, payload] = arr ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
      const send = (ev, pl, r) => ws.send(JSON.stringify(arr ? [joinRef, r, topic, ev, pl] : { topic, event: ev, payload: pl, ref: r, join_ref: joinRef }));
      if (event === 'phx_join') {
        const pc = payload?.config?.postgres_changes ?? [];
        send('phx_reply', { status: 'ok', response: { postgres_changes: pc.map((c) => ({ ...c, id: ++n })) } }, ref);
        send('system', { status: 'ok', message: 'Subscribed to PostgreSQL', extension: 'postgres_changes', channel: String(topic).replace(/^realtime:/, '') }, null);
      } else send('phx_reply', { status: 'ok', response: {} }, ref);
    });
  });
});
server.listen(54321, () => console.log('gateway on :54321'));
