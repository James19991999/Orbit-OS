// Local stand-in for the Anthropic Messages API, used ONLY by end-to-end tests.
//   POST /v1/messages     → a short brief built from the <workspace_data> in the prompt
//   GET  /__last          → the last request body received (to check the prompt)
//   POST /__fail {on}     → make /v1/messages return 529 (overloaded) until turned off
import http from 'node:http';
const PORT = Number(process.env.PORT || 54420);
const KEY = process.env.AI_MOCK_KEY || 'local-anthropic-key';
let last = null; let failing = false; let calls = 0;
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const read = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/v1/messages') {
    if (req.headers['x-api-key'] !== KEY) return send(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    if (!req.headers['anthropic-version']) return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'anthropic-version header is required' } });
    const b = await read(req);
    last = b; calls++;
    if (failing) return send(res, 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    if (!b.model || !b.max_tokens || !Array.isArray(b.messages)) return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'model, max_tokens and messages are required' } });
    const prompt = String(b.messages[0]?.content ?? '');
    const m = prompt.match(/<workspace_data>\n([\s\S]*?)\n<\/workspace_data>/);
    let f = {}; try { f = JSON.parse(m?.[1] ?? '{}'); } catch { /* ignore */ }
    const lang = /Write in (\w+)/.exec(String(b.system ?? ''))?.[1] ?? 'English';
    const text = `**Mock brief (${lang}) for ${f.org}: ${f.checkins} check-ins from ${f.people} of ${f.members} people.**\n\n## Wins\n- ${(f.shipped ?? []).slice(0, 2).map((s) => `${s.name}: ${s.text}`).join('\n- ') || 'none'}\n\nRisks and blockers\n• ${(f.blockers ?? []).length} reported`;
    return send(res, 200, { id: `msg_mock_${calls}`, type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 } });
  }
  if (req.method === 'GET' && url.pathname === '/__last') return send(res, 200, { last, calls });
  if (req.method === 'POST' && url.pathname === '/__fail') { failing = !!(await read(req)).on; return send(res, 200, { failing }); }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`Anthropic mock on :${PORT}`));
