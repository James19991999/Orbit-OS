import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/redirect';
import { ORG_COOKIE } from '@/lib/env';
import { audit } from '@/lib/api';

/** Completes OAuth / SAML SSO (?code=) and email links (?token_hash=&type=) then redirects. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const org = url.searchParams.get('org');
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (providerError) return fail(providerError);

  const supabase = await createClient();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
    if (type === 'recovery') return NextResponse.redirect(new URL('/reset-password', url.origin));
  } else {
    return fail('Missing sign-in code');
  }

  const res = NextResponse.redirect(new URL(next, url.origin));
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: ms } = await supabase.from('memberships').select('org_id, org:organizations(slug)').eq('user_id', user.id).eq('status', 'active');
    const rows = (ms ?? []) as unknown as { org_id: string; org: { slug: string } | null }[];
    const chosen = rows.find((r) => r.org?.slug === org) ?? rows[0];
    if (chosen?.org) {
      res.cookies.set(ORG_COOKIE, chosen.org.slug, { path: '/', sameSite: 'lax', httpOnly: true, secure: url.protocol === 'https:', maxAge: 31536000 });
      await audit(req, chosen.org_id, user.id, 'auth.login', { type: 'user', id: user.id }, { method: user.app_metadata?.provider ?? 'link' });
    }
  }
  return res;
}
