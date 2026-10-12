import { z } from 'zod';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { handler, json, parseBody, rateLimit, clientIp, ApiError } from '@/lib/api';
import { likeExact } from '@/lib/security/request-guard';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { rp } from '@/lib/auth/webauthn';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  await rateLimit('passkey-login', clientIp(req), 10, 60);
  if (!hasServiceRole()) throw new ApiError(503, 'Passkeys need SUPABASE_SERVICE_ROLE_KEY on the server');
  const { email } = await parseBody(req, z.object({ email: z.string().email().max(254) }));
  const admin = getAdminClient();
  const { data: profile } = await admin.from('profiles').select('id').ilike('email', likeExact(email)).maybeSingle();
  const { data: keys } = profile
    ? await admin.from('passkeys').select('credential_id, transports').eq('user_id', profile.id)
    : { data: [] as { credential_id: string; transports: string[] }[] };
  const { rpID } = rp();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: (keys ?? []).map((k) => ({ id: k.credential_id, transports: k.transports as never })),
  });
  const { data: ch, error } = await admin.from('webauthn_challenges')
    .insert({ user_id: profile?.id ?? null, email: email.toLowerCase(), challenge: options.challenge, kind: 'login' })
    .select('id').single();
  if (error) throw new ApiError(500, error.message);
  return json({ challengeId: ch.id, options });
});
