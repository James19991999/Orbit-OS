// Stand-in for the Resend email API on http://localhost:54460 (RESEND_BASE_URL). Records every message so tests can
// read what was sent; an address containing "bounce" is refused like an invalid recipient. Local testing only.
import { createServer } from 'node:http';

const log = [];
createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && url.pathname === '/log') return send(200, log);
    if (req.method === 'DELETE' && url.pathname === '/log') { log.length = 0; return send(200, {}); }
    if (req.method === 'POST' && url.pathname === '/emails') {
      if (!String(req.headers.authorization || '').startsWith('Bearer re_')) return send(401, { name: 'missing_api_key', message: 'Missing API key', statusCode: 401 });
      let m; try { m = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { name: 'validation_error', message: 'Invalid JSON', statusCode: 400 }); }
      const to = [].concat(m.to || []);
      if (to.some((x) => /bounce/.test(x))) return send(422, { name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 });
      const id = `mock_${log.length + 1}`;
      log.push({ id, at: Date.now(), from: m.from, to, subject: m.subject, html: m.html });
      return send(200, { id });
    }
    send(404, { message: 'not found' });
  });
}).listen(54460, () => console.log('email mock on http://localhost:54460'));
