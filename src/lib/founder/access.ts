import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/context';
import { isFounderEmail } from './emails';

/**
 * The Founder Console shows every workspace, so it needs all three:
 *   1. a signed-in account whose (verified) email is in FOUNDER_EMAILS;
 *   2. a two-factor verified session (AAL2) — anyone else is sent to set up or enter their code;
 *   3. nothing else: other people get a plain 404, so the page's existence isn't revealed.
 */
export async function requireFounder() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login?next=%2Ffounder');
  if (!isFounderEmail(ctx.user.email)) notFound();
  if (ctx.aal.current !== 'aal2') redirect('/mfa?next=%2Ffounder');
  return ctx;
}
