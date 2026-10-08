import { generateRegistrationOptions } from '@simplewebauthn/server';
import { handler, json, ApiError } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { rp } from '@/lib/auth/webauthn';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'Not signed in');
  const admin = getAdminClient();
  const { data: existing } = await admin.from('passkeys').select('credential_id, transports').eq('user_id', user.id);
  const { rpID, rpName } = rp();
  const options = await generateRegistrationOptions({
    rpName, rpID,
    userName: user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((k) => ({ id: k.credential_id, transports: k.transports as never })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  const { data: ch, error } = await admin.from('webauthn_challenges')
    .insert({ user_id: user.id, email: user.email, challenge: options.challenge, kind: 'register' }).select('id').single();
  if (error) throw new ApiError(500, error.message);
  return json({ challengeId: ch.id, options });
});
