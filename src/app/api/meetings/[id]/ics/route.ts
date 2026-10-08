import { handler, requireApiContext, ApiError } from '@/lib/api';
import { buildIcs } from '@/lib/ics';
import type { Meeting } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, route) => {
  const params = await route.params;
  const ctx = await requireApiContext();
  const { data } = await ctx.supabase.from('meetings').select('*').eq('id', params.id).eq('org_id', ctx.org.id).maybeSingle();
  if (!data) throw new ApiError(404, 'Meeting not found');
  const m = data as Meeting;
  const ics = buildIcs({ uid: m.id, title: m.title, description: m.description, start: new Date(m.starts_at), durationMin: m.duration_min, url: m.video_url, method: 'PUBLISH' });
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="${m.title.replace(/[^\w-]+/g, '_').slice(0, 60)}.ics"` } });
});
