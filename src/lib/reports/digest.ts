import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadReport } from './load';
import { reportToPdf, reportToSlack, reportHeadline } from './render';
import { buildPdf } from './pdf';
import { sendEmail, emailLayout, escapeHtml } from '@/lib/email';
import { slackWebhookFor, postToSlack } from '@/lib/integrations';
import { appUrl } from '@/lib/env';
import type { Organization, ReportSchedule } from '@/lib/types';

export function isDue(s: Pick<ReportSchedule, 'cadence' | 'weekday' | 'month_day' | 'hour_utc' | 'last_run_at' | 'enabled'>, now = new Date()): boolean {
  if (!s.enabled || now.getUTCHours() !== s.hour_utc) return false;
  if (s.last_run_at && now.getTime() - new Date(s.last_run_at).getTime() < 20 * 3_600_000) return false;
  if (s.cadence === 'weekly') return now.getUTCDay() === (s.weekday ?? 1);
  return now.getUTCDate() === (s.month_day ?? 1);
}

/** Builds the report and sends it to the schedule's destination. Returns a human-readable status. */
export async function runDigest(sb: SupabaseClient, org: Organization, s: ReportSchedule, opts: { asService?: boolean } = {}): Promise<{ ok: boolean; status: string }> {
  const report = await loadReport(sb, org, s.cadence === 'weekly' ? 'last_30' : 'quarter', { asService: opts.asService });
  const link = `${appUrl()}/reports`;
  if (s.destination === 'slack') {
    const url = await slackWebhookFor(sb, org.id);
    if (!url) return { ok: false, status: 'Slack is not connected (Settings → Integrations)' };
    const r = await postToSlack(url, reportToSlack(report, link));
    return r.ok ? { ok: true, status: 'Posted to Slack' } : { ok: false, status: r.error ?? 'Slack failed' };
  }
  if (!s.recipients.length) return { ok: false, status: 'No recipients configured' };
  const pdf = await buildPdf(reportToPdf(report));
  const rows = reportHeadline(report).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join('');
  const res = await sendEmail({
    to: s.recipients, subject: `${s.name} — ${org.name} (${report.period.label})`,
    html: emailLayout(s.name, `<table role="presentation">${rows}</table><p>The full dossier is attached as a PDF.</p>`, { label: 'Open Reports', url: link }),
    attachments: [{ filename: `${org.slug}-${report.period.key}.pdf`, content: Buffer.from(pdf) }],
  });
  if (res.sent) return { ok: true, status: `Emailed ${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}` };
  return { ok: false, status: res.reason === 'not_configured' ? 'Email is not configured (RESEND_API_KEY)' : `Email failed: ${res.error}` };
}
