import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { loadConfig, publicConfig, registerItem } from '@/lib/etims/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ code: z.string().regex(/^\d{1,10}$/), name: z.string().trim().min(1).max(200), itemName: z.string().trim().min(2).max(200) }).strict();

/** Owner: register the service your invoices are for, under the KRA classification chosen. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  const b = await parseBody(req, Body);
  const admin = getAdminClient();
  const cfg = await loadConfig(admin, ctx.org.id);
  if (!cfg?.cmc_key_enc) throw new ApiError(409, 'Connect your eTIMS device first.');
  const { data: known } = await admin.from('etims_item_classes').select('code, name').eq('environment', cfg.environment).eq('code', b.code).maybeSingle();
  if (!known) throw new ApiError(400, 'Pick a classification from KRA’s list.');
  const next = await registerItem(admin, cfg, { code: known.code as string, name: known.name as string }, b.itemName, ctx.user.id);
  await audit(req, ctx.org.id, ctx.user.id, 'etims.item_registered', { type: 'organization', id: ctx.org.id }, { classification: b.code, item: next.item_cd });
  return json({ config: publicConfig(next) });
});
