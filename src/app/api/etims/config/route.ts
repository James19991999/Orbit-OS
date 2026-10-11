import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { isEncryptionConfigured } from '@/lib/crypto/secrets';
import { connectDevice, loadConfig, publicConfig, processScope } from '@/lib/etims/service';
import { TAX_TYPES } from '@/lib/etims/compose';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The workspace's KRA eTIMS device: status for finance roles, never the communication key. */
export const GET = handler(async () => {
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'auditor'] });
  const admin = getAdminClient();
  const cfg = await loadConfig(admin, ctx.org.id);
  const { data: docs } = await admin.from('etims_documents').select('status').eq('scope', ctx.org.id);
  const counts = { submitted: 0, queued: 0, rejected: 0 };
  for (const d of docs ?? []) if (d.status in counts) counts[d.status as keyof typeof counts]++;
  return json({ config: publicConfig(cfg), encryptionConfigured: isEncryptionConfigured(), counts });
});

const Body = z.object({
  environment: z.enum(['sandbox', 'production']),
  tin: z.string().trim().min(11).max(20),
  bhfId: z.string().regex(/^\d{2}$/),
  deviceSerial: z.string().trim().min(1).max(100),
  taxType: z.enum(TAX_TYPES as [string, ...string[]]),
  itemName: z.string().trim().min(2).max(200).optional(),
}).strict();

/** Owner: connect (or re-connect) the device. KRA issues the communication key on this call. */
export const PUT = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  await rateLimit('etims-connect', ctx.user.id, 10, 3600);
  if (!isEncryptionConfigured()) throw new ApiError(503, 'ENCRYPTION_KEY isn’t set on the server, so the KRA key can’t be stored safely. Ask whoever deploys OrbitOS to add it.');
  const b = await parseBody(req, Body);
  const cfg = await connectDevice(getAdminClient(), ctx.org.id, ctx.org.id, { ...b, taxType: b.taxType as never }, ctx.user.id);
  await audit(req, ctx.org.id, ctx.user.id, 'etims.connected', { type: 'organization', id: ctx.org.id }, { environment: b.environment, tin: cfg.tin, bhfId: cfg.bhf_id });
  return json({ config: publicConfig(cfg) });
});

/** Owner: retry everything waiting now (e.g. after KRA was down). */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director'], writable: true });
  await rateLimit('etims-retry', ctx.user.id, 10, 60);
  const r = await processScope(getAdminClient(), ctx.org.id, { ignoreSchedule: true });
  await audit(req, ctx.org.id, ctx.user.id, 'etims.retried', { type: 'organization', id: ctx.org.id }, r);
  return json(r);
});

/** Owner: disconnect. Documents already sent stay on record; nothing new goes to KRA. */
export const DELETE = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  const { error } = await getAdminClient().from('etims_configs').update({ status: 'not_connected', cmc_key_enc: null, updated_by: ctx.user.id, updated_at: new Date().toISOString() }).eq('scope', ctx.org.id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'etims.disconnected', { type: 'organization', id: ctx.org.id });
  return json({ ok: true });
});
