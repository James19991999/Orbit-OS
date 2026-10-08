import { handler, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { toCsv } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'auditor'] });
  await rateLimit('audit-export', ctx.user.id, 10, 300);
  const sp = req.nextUrl.searchParams;
  let q = ctx.supabase.from('audit_log').select('created_at, action, actor_id, target_type, target_id, metadata, ip, user_agent').eq('org_id', ctx.org.id).order('created_at', { ascending: false }).limit(20_000);
  if (sp.get('q')) q = q.ilike('action', `%${sp.get('q')!.replace(/[%_]/g, '')}%`);
  if (sp.get('actor')) q = q.eq('actor_id', sp.get('actor')!);
  if (sp.get('from')) q = q.gte('created_at', sp.get('from')!);
  if (sp.get('to')) q = q.lte('created_at', `${sp.get('to')}T23:59:59Z`);
  const { data, error } = await q;
  if (error) throw new ApiError(500, error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  await audit(req, ctx.org.id, ctx.user.id, 'export.audit_log', { type: 'organization', id: ctx.org.id }, { rows: rows.length });
  const csv = toCsv([['created_at', 'action', 'actor_id', 'target_type', 'target_id', 'metadata', 'ip', 'user_agent'],
    ...rows.map((r) => [r.created_at as string, r.action as string, r.actor_id as string, r.target_type as string, r.target_id as string, JSON.stringify(r.metadata ?? {}), r.ip as string, r.user_agent as string])]);
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${ctx.org.slug}-audit-log.csv"`, 'cache-control': 'no-store' } });
});
