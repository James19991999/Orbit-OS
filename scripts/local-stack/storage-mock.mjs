// Minimal Supabase Storage stand-in for the local gateway: upload, list, remove and public download.
// Every write runs in Postgres as the caller's role with their JWT claims, so the real storage.objects
// row-level security policies from the migrations decide who may upload or delete. Local testing only.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SECRET = process.env.JWT_SECRET || 'local-dev-jwt-secret-at-least-32-characters-long';
const DB = process.env.DB || 'orbitos_e2e';
const ROOT = process.env.STORAGE_DIR || '/tmp/orbit-storage';
const SAFE = /^[A-Za-z0-9_-]+$/;
const SAFE_PATH = /^[A-Za-z0-9._\/-]+$/;

function claimsOf(req) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer /, '') || String(req.headers.apikey || '');
  const [h, b, s] = tok.split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null;
  const c = JSON.parse(Buffer.from(b, 'base64url').toString());
  return ['anon', 'authenticated', 'service_role'].includes(c.role) && (!c.exp || c.exp * 1000 > Date.now()) ? c : null;
}

/** Runs SQL as the caller (role + JWT claims) in one transaction; returns rows as text lines. */
function asCaller(claims, sql, vars) {
  const args = ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1',
    '-v', `role=${claims.role}`, '-v', `claims=${JSON.stringify(claims)}`];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  const script = `begin;\nset local role :"role";\nselect set_config('request.jwt.claims', :'claims', true) \\g /dev/null\n${sql}\ncommit;\n`;
  return execFileSync('psql', args, { input: script, stdio: ['pipe', 'pipe', 'pipe'] }).toString().split('\n').filter(Boolean);
}
const bucketRow = (id) => {
  const out = execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', DB, '-qtA', '-F', '\t', '-v', `b=${id}`],
    { input: `select public, coalesce(file_size_limit, 0), coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets where id = :'b';\n` }).toString().trim();
  if (!out) return null;
  const [pub, limit, mimes] = out.split('\t');
  return { public: pub === 't', limit: Number(limit), mimes: mimes ? mimes.split(',') : [] };
};
/** The first part with a filename in a multipart body: its bytes and Content-Type. */
function multipartFile(buf, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  let at = buf.indexOf(sep);
  while (at !== -1) {
    const next = buf.indexOf(sep, at + sep.length);
    if (next === -1) break;
    const part = buf.subarray(at + sep.length + 2, next - 2);   // skip CRLF after boundary, drop CRLF before the next
    const split = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, split).toString();
    if (/filename=/.test(head)) {
      const type = (/content-type:\s*([^\r\n;]+)/i.exec(head)?.[1] || 'application/octet-stream').trim();
      return { data: part.subarray(split + 4), type };
    }
    at = next;
  }
  return null;
}
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const err = (res, code, message) => send(res, code, { statusCode: String(code), error: code === 403 ? 'Unauthorized' : 'Error', message });
const readBody = (req) => new Promise((ok, no) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });

export async function handleStorage(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/^\/storage\/v1/, '');
  try {
    // Public download: GET /object/public/<bucket>/<path>
    let m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(p);
    if (m && req.method === 'GET') {
      const [, bucket, name] = m;
      const b = SAFE.test(bucket) && SAFE_PATH.test(name) && !name.includes('..') ? bucketRow(bucket) : null;
      const file = b?.public ? join(ROOT, bucket, name) : null;
      if (!file || !existsSync(file)) return err(res, 404, 'Object not found');
      const meta = JSON.parse(readFileSync(`${file}.meta`, 'utf8'));
      res.writeHead(200, { 'content-type': meta.type, 'cache-control': 'public, max-age=31536000' });
      return res.end(readFileSync(file));
    }
    const claims = claimsOf(req);
    if (!claims) return err(res, 401, 'Invalid JWT');
    // List: POST /object/list/<bucket> { prefix, search, limit }
    m = /^\/object\/list\/([^/]+)$/.exec(p);
    if (m && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const prefix = String(body.prefix || '').replace(/\/$/, '');
      const rows = asCaller(claims, `select name from storage.objects where bucket_id = :'b' and name like :'pre' || '/%' and position(:'q' in name) > 0 order by name limit ${Math.min(1000, Number(body.limit) || 100)};`,
        { b: m[1], pre: prefix, q: String(body.search || '') });
      return send(res, 200, rows.map((n) => ({ name: n.slice(prefix.length + 1), id: n, metadata: {} })));
    }
    // Remove: DELETE /object/<bucket> { prefixes: [...] }
    m = /^\/object\/([^/]+)$/.exec(p);
    if (m && req.method === 'DELETE') {
      const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
      const removed = [];
      for (const name of prefixes) {
        if (!SAFE_PATH.test(name) || name.includes('..')) continue;
        const rows = asCaller(claims, `delete from storage.objects where bucket_id = :'b' and name = :'n' returning name;`, { b: m[1], n: name });
        if (rows.length) { rmSync(join(ROOT, m[1], name), { force: true }); rmSync(join(ROOT, m[1], `${name}.meta`), { force: true }); removed.push({ name }); }
      }
      return send(res, 200, removed);
    }
    // Upload: POST|PUT /object/<bucket>/<path>
    m = /^\/object\/([^/]+)\/(.+)$/.exec(p);
    if (m && (req.method === 'POST' || req.method === 'PUT')) {
      const [, bucket, name] = m;
      if (!SAFE.test(bucket) || !SAFE_PATH.test(name) || name.includes('..')) return err(res, 400, 'Invalid key');
      const b = bucketRow(bucket);
      if (!b) return err(res, 404, 'Bucket not found');
      let data = await readBody(req);
      let type = String(req.headers['content-type'] || '').split(';')[0];
      // supabase-js sends a File/Blob as multipart/form-data: the file part carries the real type.
      if (type === 'multipart/form-data') {
        const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(String(req.headers['content-type']));
        const part = boundary ? multipartFile(data, boundary[1] || boundary[2]) : null;
        if (!part) return err(res, 400, 'No file in upload');
        ({ data, type } = part);
      }
      if (b.limit && data.length > b.limit) return err(res, 413, 'The object exceeded the maximum allowed size');
      if (b.mimes.length && !b.mimes.includes(type)) return err(res, 415, `mime type ${type} is not supported`);
      try {
        asCaller(claims, `insert into storage.objects (bucket_id, name) values (:'b', :'n');`, { b: bucket, n: name });
      } catch (e) {
        const msg = String(e.stderr || e.message);
        if (/row-level security|permission denied/.test(msg)) return err(res, 403, 'new row violates row-level security policy');
        if (/duplicate|unique/.test(msg)) return err(res, 409, 'The resource already exists');
        throw e;
      }
      const file = join(ROOT, bucket, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, data);
      writeFileSync(`${file}.meta`, JSON.stringify({ type }));
      return send(res, 200, { Key: `${bucket}/${name}`, Id: name });
    }
    return err(res, 501, 'not available in local stack');
  } catch (e) {
    return err(res, 500, String(e.stderr || e.message).split('\n')[0]);
  }
}
