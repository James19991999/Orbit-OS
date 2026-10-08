import { z } from 'zod';
import { cookies } from 'next/headers';
import { handler, json, parseBody, requireApiContext, audit } from '@/lib/api';
import { ORG_COOKIE } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const { slug } = await parseBody(req, z.object({ slug: z.string().regex(/^[a-z0-9-]{3,40}$/) }));
  // verifies membership server-side before the cookie is set — a forged slug gets 403
  const ctx = await requireApiContext({ orgSlug: slug });
  (await cookies()).set(ORG_COOKIE, slug, { path: '/', sameSite: 'lax', httpOnly: true, secure: req.nextUrl.protocol === 'https:', maxAge: 60 * 60 * 24 * 365 });
  await audit(req, ctx.org.id, ctx.user.id, 'org.switched', { type: 'organization', id: ctx.org.id });
  return json({ ok: true, org: { slug: ctx.org.slug, name: ctx.org.name } });
});
