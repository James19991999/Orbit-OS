import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { handler, json, ApiError } from '@/lib/api';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { pushConfigured, pushNotification } from '@/lib/push';

export const dynamic = 'force-dynamic';

const Payload = z.object({ type: z.string(), table: z.string(), record: z.object({ id: z.string().uuid() }).passthrough() }).passthrough();

function secretOk(header: string | null): boolean {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const got = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Supabase Database Webhook: "on insert into notifications, POST here" (docs/PUSH.md).
 * Re-reads the notification itself; the request body is only used for its id.
 */
export const POST = handler(async (req) => {
  if (!secretOk(req.headers.get('authorization'))) throw new ApiError(401, 'Unauthorized');
  if (!pushConfigured() || !hasServiceRole()) return json({ sent: 0, skipped: 'not_configured' });
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, 'Body must be JSON'); }
  const body = Payload.parse(raw);
  if (body.table !== 'notifications' || body.type !== 'INSERT') return json({ sent: 0, skipped: 'ignored' });
  return json(await pushNotification(getAdminClient(), body.record.id));
});
