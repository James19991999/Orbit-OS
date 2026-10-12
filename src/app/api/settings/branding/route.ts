import { z } from 'zod';
import { handler, json, parseBody, requireApiContext, audit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  color: z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/).nullable().optional(),
  logoPath: z.string().max(120).nullable().optional(),
}).strict();

/**
 * Owner: the workspace's accent colour and logo. The logo file itself is uploaded straight to the "branding" bucket
 * (owner-only storage policy); this only records which file to show, and removes the previous one.
 */
export const PATCH = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'], writable: true });
  const body = await parseBody(req, Body);
  const update: { brand_color?: string | null; brand_logo_path?: string | null } = {};
  if (body.color !== undefined) update.brand_color = body.color;
  if (body.logoPath !== undefined) {
    const ok = body.logoPath === null || new RegExp(`^${ctx.org.id}/logo-[0-9]{10,16}\\.(png|jpg|webp)$`).test(body.logoPath);
    if (!ok) throw new ApiError(400, 'That logo file does not belong to this workspace.');
    update.brand_logo_path = body.logoPath;
  }
  if (!Object.keys(update).length) throw new ApiError(400, 'Nothing to change.');

  const admin = getAdminClient();
  if (update.brand_logo_path) {
    // The file must really be there (uploaded by an owner of this workspace).
    const name = update.brand_logo_path.split('/')[1]!;
    const { data } = await admin.storage.from('branding').list(ctx.org.id, { search: name, limit: 1 });
    if (!data?.some((f) => f.name === name)) throw new ApiError(400, 'Upload the logo first.');
  }
  const previous = ctx.org.brand_logo_path ?? null;
  const { error } = await admin.from('organizations').update(update).eq('id', ctx.org.id);
  if (error) throw new ApiError(500, error.message);
  if (update.brand_logo_path !== undefined && previous && previous !== update.brand_logo_path) {
    await admin.storage.from('branding').remove([previous]);
  }
  await audit(req, ctx.org.id, ctx.user.id, 'org.branding_updated', { type: 'organization', id: ctx.org.id },
    { color: update.brand_color, logo: update.brand_logo_path === undefined ? undefined : update.brand_logo_path ? 'set' : 'removed' });
  return json({
    color: update.brand_color !== undefined ? update.brand_color : ctx.org.brand_color ?? null,
    logoPath: update.brand_logo_path !== undefined ? update.brand_logo_path : previous,
  });
});
