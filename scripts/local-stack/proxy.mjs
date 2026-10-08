// Minimal Supabase-style gateway: /auth/v1 → GoTrue, /rest/v1 → PostgREST. Local testing only.
import http from 'node:http';
const routes = [['/auth/v1', 9999], ['/rest/v1', 3001]];
http.createServer((req, res) => {
  const hit = routes.find(([p]) => req.url.startsWith(p));
  res.setHeader('access-control-allow-origin', req.headers.origin || '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-expose-headers', 'content-range, x-supabase-api-version');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
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
}).listen(54321, () => console.log('gateway on :54321'));
