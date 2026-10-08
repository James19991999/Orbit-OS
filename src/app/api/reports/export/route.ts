import { handler, requireApiContext, audit, rateLimit } from '@/lib/api';
import { loadReport } from '@/lib/reports/load';
import { isPeriodKey } from '@/lib/reports/period';
import { reportToPdf, reportToCsv } from '@/lib/reports/render';
import { buildPdf, toCsv } from '@/lib/reports/pdf';
import { getLocale } from '@/lib/locale/server';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'auditor'] });
  await rateLimit('report-export', ctx.user.id, 20, 300);
  const period = isPeriodKey(req.nextUrl.searchParams.get('period')) ? req.nextUrl.searchParams.get('period') as never : 'quarter';
  const format = req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'pdf';
  const r = await loadReport(ctx.supabase, ctx.org, period);
  await audit(req, ctx.org.id, ctx.user.id, 'export.report', { type: 'report', id: period }, { format });
  const name = `${ctx.org.slug}-${period}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    return new Response(toCsv(reportToCsv(r)), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"`, 'cache-control': 'no-store' } });
  }
  const pdf = await buildPdf(reportToPdf(r, await getLocale()));
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}.pdf"`, 'cache-control': 'no-store' } });
});
