import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { normalizeKraPin } from '@/lib/etims/compose';

export const dynamic = 'force-dynamic';

const Body = z.object({ kraPin: z.string().trim().max(20).nullable() }).strict();

/** Owner: the workspace's KRA PIN, printed on OrbitOS plan receipts so the payment can be claimed as input VAT. */
export const PATCH = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  const { kraPin } = await parseBody(req, Body);
  const pin = kraPin ? normalizeKraPin(kraPin) : null;
  if (kraPin && !pin) throw new ApiError(400, 'Enter the KRA PIN as a letter, nine digits and a letter (e.g. P051234567X).');
  const { error } = await getAdminClient().from('organizations').update({ kra_pin: pin }).eq('id', ctx.org.id);
  if (error) throw new ApiError(500, error.message);
  await audit(req, ctx.org.id, ctx.user.id, 'org.billing_details_updated', { type: 'organization', id: ctx.org.id }, { kraPin: pin ? 'set' : 'cleared' });
  return json({ kraPin: pin });
});
