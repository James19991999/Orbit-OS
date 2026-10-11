import JSZip from 'jszip';
import { handler, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { planAllows } from '@/lib/billing/plans';
import { toCsv } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TABLES = ['organizations', 'memberships', 'legal_entities', 'sprints', 'tasks', 'finance_entries', 'invoices', 'payroll_runs', 'meetings',
  'meeting_participants', 'check_ins', 'channels', 'messages', 'polls', 'poll_options', 'kudos', 'lounges', 'compliance_frameworks',
  'compliance_controls', 'compliance_evidence', 'vault_documents', 'policies', 'dsar_requests', 'devices', 'training_campaigns',
  'training_assignments', 'report_schedules', 'billing_payments', 'audit_log', 'activity_events', 'payout_batches', 'payout_lines', 'ai_briefs', 'etims_documents'] as const;

/** Full tenant archive (owner, Enterprise, MFA session): every org table as JSON + CSV, streamed as a ZIP. */
export const POST = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner'] });
  if (!planAllows(ctx.org.plan, 'tenantArchive')) throw new ApiError(402, 'Full tenant archives are part of the Enterprise plan.');
  const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') throw new ApiError(403, 'Verify with two-factor authentication first (Profile → Security).');
  await rateLimit('tenant-archive', ctx.org.id, 3, 3600);
  const admin = getAdminClient();
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const q = t === 'organizations' ? admin.from(t).select('*').eq('id', ctx.org.id) : admin.from(t).select('*').eq('org_id', ctx.org.id);
    const { data, error } = await q.limit(50_000);
    if (error) throw new ApiError(500, `${t}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    counts[t] = rows.length;
    zip.file(`json/${t}.json`, JSON.stringify(rows, null, 2));
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      zip.file(`csv/${t}.csv`, toCsv([cols, ...rows.map((r) => cols.map((c) => (typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : (r[c] as string | number | null))))]));
    }
  }
  zip.file('README.txt', `OrbitOS tenant archive for ${ctx.org.name} (${ctx.org.slug})\nGenerated ${new Date().toISOString()}\n\n` +
    Object.entries(counts).map(([t, n]) => `${t}: ${n} rows`).join('\n') + '\n\nUploaded files (evidence, vault) are listed in json/compliance_evidence.json and json/vault_documents.json.\n');
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await audit(req, ctx.org.id, ctx.user.id, 'export.tenant_archive', { type: 'organization', id: ctx.org.id }, { rows: Object.values(counts).reduce((a, b) => a + b, 0) });
  return new Response(new Uint8Array(buf), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${ctx.org.slug}-archive-${new Date().toISOString().slice(0, 10)}.zip"`, 'cache-control': 'no-store' } });
});
