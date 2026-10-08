import { z } from 'zod';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { cookies } from 'next/headers';
import { handler, json, parseBody, rateLimit, clientIp, ApiError, audit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { rp, CHALLENGE_TTL_MS } from '@/lib/auth/webauthn';
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from '@/lib/env';

export const dynamic = 'force-dynamic';

const Body = z.object({ challengeId: z.string().uuid(), response: z.any(), remember: z.boolean().optional() });

/**
 * Verifies a WebAuthn assertion, then mints a normal Supabase session for that user:
 * admin.generateLink(magiclink) → verifyOtp(token_hash) on the server sets the auth cookies.
 */
export const POST = handler(async (req) => {
  await rateLimit('passkey-verify', clientIp(req), 10, 60);
  const { challengeId, response, remember } = await parseBody(req, Body);
  const admin = getAdminClient();
  const { data: ch } = await admin.from('webauthn_challenges').select('*').eq('id', challengeId).eq('kind', 'login').maybeSingle();
  if (!ch) throw new ApiError(400, 'Sign-in challenge expired. Try again.');
  await admin.from('webauthn_challenges').delete().eq('id', challengeId); // single use
  if (Date.now() - new Date(ch.created_at).getTime() > CHALLENGE_TTL_MS) throw new ApiError(400, 'Sign-in challenge expired. Try again.');

  const credId = typeof response?.id === 'string' ? response.id : '';
  const { data: key } = await admin.from('passkeys').select('*').eq('credential_id', credId).maybeSingle();
  if (!key) throw new ApiError(401, 'This passkey is not registered with OrbitOS.');
  if (ch.user_id && ch.user_id !== key.user_id) throw new ApiError(401, 'This passkey belongs to a different account.');

  const { rpID, origin } = rp();
  const verification = await verifyAuthenticationResponse({
    response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
    credential: { id: key.credential_id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: Number(key.counter), transports: key.transports },
  }).catch((e: Error) => { throw new ApiError(401, `Passkey verification failed: ${e.message}`); });
  if (!verification.verified) throw new ApiError(401, 'Passkey verification failed.');
  await admin.from('passkeys').update({ counter: verification.authenticationInfo.newCounter }).eq('id', key.id);

  const { data: userRes, error: uErr } = await admin.auth.admin.getUserById(key.user_id);
  if (uErr || !userRes.user?.email) throw new ApiError(500, 'Account lookup failed');
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: userRes.user.email });
  if (lErr || !link.properties?.hashed_token) throw new ApiError(500, lErr?.message ?? 'Could not create session');

  (await cookies()).set(REMEMBER_COOKIE, remember === false ? '0' : '1', { path: '/', sameSite: 'lax', ...(remember === false ? {} : { maxAge: REMEMBER_MAX_AGE }) });
  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vErr) throw new ApiError(500, vErr.message);

  const { data: ms } = await admin.from('memberships').select('org_id').eq('user_id', key.user_id).eq('status', 'active').limit(1);
  if (ms?.[0]) await audit(req, ms[0].org_id, key.user_id, 'auth.login', { type: 'user', id: key.user_id }, { method: 'passkey' });
  return json({ ok: true });
});
