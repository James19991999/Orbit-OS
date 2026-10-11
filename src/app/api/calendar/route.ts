import { handler, json, requireApiContext, audit } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptSecret } from '@/lib/crypto/secrets';
import { revoke } from '@/lib/calendar/providers';
import { loadConnections } from '@/lib/calendar/service';

export const dynamic = 'force-dynamic';

/** Disconnect: OrbitOS forgets the tokens and busy times. Events already in the calendar stay there. */
export const DELETE = handler(async (req) => {
  const ctx = await requireApiContext();
  const admin = getAdminClient();
  const c = (await loadConnections(admin, [ctx.user.id])).get(ctx.user.id);
  if (c) {
    try { await revoke(c.provider, decryptSecret(c.refresh_token_enc)); } catch { /* best effort */ }
    await admin.from('calendar_event_links').delete().eq('user_id', ctx.user.id);
    await admin.from('calendar_busy').delete().eq('user_id', ctx.user.id);
    await admin.from('calendar_connections').delete().eq('user_id', ctx.user.id);
    await audit(req, ctx.org.id, ctx.user.id, 'calendar.disconnected', { type: 'calendar', id: ctx.user.id }, { provider: c.provider });
  }
  return json({ ok: true });
});
