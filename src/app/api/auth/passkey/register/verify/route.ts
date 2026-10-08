import { z } from 'zod';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { handler, json, parseBody, ApiError } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { rp, CHALLENGE_TTL_MS } from '@/lib/auth/webauthn';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'Not signed in');
  const { challengeId, response, label } = await parseBody(req, z.object({ challengeId: z.string().uuid(), response: z.any(), label: z.string().max(60).optional() }));
  const admin = getAdminClient();
  const { data: ch } = await admin.from('webauthn_challenges').select('*').eq('id', challengeId).eq('kind', 'register').eq('user_id', user.id).maybeSingle();
  if (!ch) throw new ApiError(400, 'Registration expired. Try again.');
  await admin.from('webauthn_challenges').delete().eq('id', challengeId);
  if (Date.now() - new Date(ch.created_at).getTime() > CHALLENGE_TTL_MS) throw new ApiError(400, 'Registration expired. Try again.');
  const { rpID, origin } = rp();
  const v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false })
    .catch((e: Error) => { throw new ApiError(400, `Passkey registration failed: ${e.message}`); });
  if (!v.verified) throw new ApiError(400, 'Passkey registration failed.');
  const c = v.registrationInfo.credential;
  const { error } = await admin.from('passkeys').insert({
    user_id: user.id, credential_id: c.id, public_key: isoBase64URL.fromBuffer(c.publicKey), counter: c.counter,
    transports: c.transports ?? [], label: label || 'Passkey',
  });
  if (error) throw new ApiError(500, error.message);
  return json({ ok: true });
});
