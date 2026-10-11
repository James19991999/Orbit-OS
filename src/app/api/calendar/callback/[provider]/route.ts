import { NextResponse } from 'next/server';
import { handler, requireApiContext, audit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/crypto/secrets';
import { appUrl } from '@/lib/env';
import { exchangeCode, PROVIDERS, type Provider } from '@/lib/calendar/providers';
import { backfillUpcoming, loadConnections, readState, redirectUri, refreshBusy } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const back = (status: string) => NextResponse.redirect(`${appUrl()}/profile?calendar=${status}#calendar`);

/** The provider sends the person back here with a one-time code, which is exchanged for tokens server-side. */
export const GET = handler<{ params: Promise<{ provider: string }> }>(async (req, route) => {
  const { provider } = await route.params;
  const p = provider as Provider;
  const sp = req.nextUrl.searchParams;
  const ctx = await requireApiContext();
  const state = readState(sp.get('state') ?? '', req.cookies.get('orbit_cal_nonce')?.value);
  // The state must be ours, recent, for this browser (cookie nonce), this provider and the person signed in now.
  if (!PROVIDERS.includes(p) || !state || state.p !== p || state.u !== ctx.user.id) return back('invalid');
  if (sp.get('error') || !sp.get('code')) return back(sp.get('error') === 'access_denied' ? 'denied' : 'error');
  let tokens;
  try { tokens = await exchangeCode(p, sp.get('code')!, redirectUri(p)); } catch { return back('error'); }
  if (!tokens.refreshToken) return back('no_offline');   // without offline access OrbitOS couldn't keep the calendar in sync
  const admin = getAdminClient();
  const previous = (await loadConnections(admin, [ctx.user.id])).get(ctx.user.id);
  if (previous && previous.provider !== p) await admin.from('calendar_event_links').delete().eq('user_id', ctx.user.id);
  const { error } = await admin.from('calendar_connections').upsert({
    user_id: ctx.user.id, provider: p, account_email: tokens.email ?? ctx.user.email ?? 'unknown',
    refresh_token_enc: encryptSecret(tokens.refreshToken), access_token_enc: encryptSecret(tokens.accessToken), access_expires_at: tokens.expiresAt.toISOString(),
    status: 'active', last_error: null, connected_at: new Date().toISOString(), busy_synced_at: null,
  });
  if (error) return back('error');
  const conn = (await loadConnections(admin, [ctx.user.id])).get(ctx.user.id)!;
  const [added] = await Promise.all([backfillUpcoming(admin, ctx.user.id).catch(() => 0), refreshBusy(admin, conn).catch(() => false)]);
  await audit(req, ctx.org.id, ctx.user.id, 'calendar.connected', { type: 'calendar', id: ctx.user.id }, { provider: p, meetingsAdded: added });
  const res = back('connected');
  res.cookies.delete({ name: 'orbit_cal_nonce', path: '/api/calendar' });
  return res;
});
