// Stand-in for a browser push service (FCM / Mozilla / Apple) on https://localhost:54450.
// Records each push (headers + encrypted body) for the tests to decrypt; /sub/gone-* answers 410 like an expired device.
import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';

const dir = process.env.PUSH_MOCK_DIR || '/tmp/orbit-push';
const log = [];
createServer({ key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) }, (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'https://localhost');
    if (req.method === 'GET' && url.pathname === '/log') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(log)); return; }
    if (req.method === 'DELETE' && url.pathname === '/log') { log.length = 0; res.writeHead(204); res.end(); return; }
    if (req.method === 'POST' && url.pathname.startsWith('/sub/')) {
      const id = url.pathname.slice(5);
      if (id.startsWith('gone')) { res.writeHead(410); res.end('gone'); return; }
      log.push({ id, at: Date.now(), headers: { authorization: req.headers.authorization, encoding: req.headers['content-encoding'], ttl: req.headers.ttl, urgency: req.headers.urgency }, body: Buffer.concat(chunks).toString('base64') });
      res.writeHead(201); res.end(); return;
    }
    res.writeHead(404); res.end();
  });
}).listen(54450, () => console.log('push mock on https://localhost:54450'));
