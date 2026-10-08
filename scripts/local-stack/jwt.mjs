// Prints an HS256 JWT for a role (anon | service_role) signed with JWT_SECRET. Local testing only.
import { createHmac } from 'node:crypto';
const [role, secret] = process.argv.slice(2);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ iss: 'supabase-local', role, iat: 1700000000, exp: 2000000000 });
const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
process.stdout.write(`${head}.${body}.${sig}`);
