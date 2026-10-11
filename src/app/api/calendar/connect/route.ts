import { NextResponse } from 'next/server';
import { handler, requireApiContext, rateLimit, ApiError } from '@/lib/api';
import { isEncryptionConfigured } from '@/lib/crypto/secrets';
import { authorizeUrl, isProviderConfigured, PROVIDERS, type Provider } from '@/lib/calendar/providers';
import { newNonce, redirectUri, signState } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';
const NONCE_COOKIE = 'orbit_cal_nonce';

/** Starts "Connect Google Calendar / Outlook": sends the person to the provider's consent screen. */
export const GET = handler(async (req) => {
  const ctx = await requireApiContext();
  await rateLimit('calendar-connect', ctx.user.id, 10, 600);
  const p = req.nextUrl.searchParams.get('provider') as Provider;
  if (!PROVIDERS.includes(p)) throw new ApiError(400, 'Unknown calendar provider');
  if (!isProviderConfigured(p) || !isEncryptionConfigured()) throw new ApiError(503, 'Calendar sync isn’t set up on this server yet.');
  const nonce = newNonce();
  const res = NextResponse.redirect(authorizeUrl(p, redirectUri(p), signState({ u: ctx.user.id, p, n: nonce }), ctx.user.email));
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/api/calendar', maxAge: 600 });
  return res;
});
