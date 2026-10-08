import JSZip from 'jszip';
import { handler, requireApiContext, audit, rateLimit, ApiError } from '@/lib/api';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { buildPdf, toCsv } from '@/lib/reports/pdf';
import { readiness } from '@/lib/compliance/readiness';
import { planAllows } from '@/lib/billing/plans';
import type { Framework, Control, Device, Dsar, Evidence, TrainingAssignment, TrainingCampaign } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Audit-ready package: summary.pdf + controls.csv + devices.csv + evidence files, zipped. */
export const GET = handler(async (req) => {
  const ctx = await requireApiContext({ roles: ['owner', 'director', 'auditor'] });
  if (!planAllows(ctx.org.plan, 'auditPackage')) throw new ApiError(402, 'The audit-ready package is part of the Enterprise plan.');
  await rateLimit('audit-package', ctx.user.id, 5, 300);
  const sb = ctx.supabase;
  const [fwR, ctR, devR, dsR, evR, campR, memR] = await Promise.all([
    sb.from('compliance_frameworks').select('*').eq('org_id', ctx.org.id).order('name'),
    sb.from('compliance_controls').select('*').eq('org_id', ctx.org.id).order('ref'),
    sb.from('devices').select('*').eq('org_id', ctx.org.id).order('name'),
    sb.from('dsar_requests').select('*').eq('org_id', ctx.org.id).order('due_on'),
    sb.from('compliance_evidence').select('*').eq('org_id', ctx.org.id),
    sb.from('training_campaigns').select('*').eq('org_id', ctx.org.id).order('due_on', { ascending: false }).limit(1),
    sb.from('memberships').select('user_id, profile:profiles(full_name)').eq('org_id', ctx.org.id),
  ]);
  for (const r of [fwR, ctR, devR, dsR, evR, campR, memR]) if (r.error) throw new ApiError(500, r.error.message);
  const frameworks = fwR.data as Framework[]; const controls = ctR.data as Control[]; const devices = devR.data as Device[];
  const dsars = dsR.data as Dsar[]; const evidence = evR.data as Evidence[]; const campaign = (campR.data as TrainingCampaign[])[0];
  const names = Object.fromEntries((memR.data as unknown as { user_id: string; profile: { full_name: string } | null }[]).map((m) => [m.user_id, m.profile?.full_name ?? 'Member']));
  const assignments = campaign ? ((await sb.from('training_assignments').select('*').eq('campaign_id', campaign.id)).data ?? []) as TrainingAssignment[] : [];
  const generated = new Date();
  const overall = readiness(controls);
  const fwName = Object.fromEntries(frameworks.map((f) => [f.id, f.name]));

  const pdf = await buildPdf({
    title: `${ctx.org.legal_name || ctx.org.name} — Audit readiness summary`,
    subtitle: `Generated ${generated.toISOString().replace('T', ' ').slice(0, 16)} UTC by OrbitOS · tracked controls, not a certification`,
    footer: `${ctx.org.name} · confidential`,
    sections: [
      { heading: 'Overview', kv: [
        ['Applicable controls passing', `${overall.passing} of ${overall.total} (${overall.pct}%)`],
        ['Failing / in review / not started', `${overall.failing} / ${overall.inReview} / ${overall.notStarted}`],
        ['Devices compliant', `${devices.filter((d) => d.encrypted && d.agent_installed).length} of ${devices.length}`],
        ['Security training', campaign ? `${assignments.filter((a) => a.completed_at).length} of ${assignments.length} completed (${campaign.title})` : 'No campaign'],
        ['Open data subject requests', String(dsars.filter((d) => d.status !== 'closed').length)],
        ['Evidence files', String(evidence.length)],
      ] },
      { heading: 'Frameworks', table: { head: ['Framework', 'Passing', 'Readiness', 'Target audit'], widths: [220, 90, 90, 99],
        rows: frameworks.map((f) => { const r = readiness(controls.filter((c) => c.framework_id === f.id)); return [f.name, `${r.passing}/${r.total}`, `${r.pct}%`, f.target_date ?? '-']; }) } },
      { heading: 'Controls', table: { head: ['Framework', 'Ref', 'Control', 'Owner', 'Status'], widths: [80, 70, 200, 85, 64],
        rows: controls.map((c) => [fwName[c.framework_id] ?? '', c.ref, c.title, c.owner_id ? names[c.owner_id] ?? '' : '-', c.status.replace('_', ' ')]) } },
      { heading: 'Device fleet', table: { head: ['Device', 'OS', 'Owner', 'Encrypted', 'Agent'], widths: [150, 80, 130, 70, 69],
        rows: devices.map((d) => [d.name, d.os, d.owner_id ? names[d.owner_id] ?? '' : '-', d.encrypted ? 'yes' : 'NO', d.agent_installed ? 'yes' : 'NO']) } },
    ],
  });

  const zip = new JSZip();
  zip.file('summary.pdf', pdf);
  zip.file('controls.csv', toCsv([['framework', 'ref', 'title', 'owner', 'status', 'last_reviewed_at', 'notes'],
    ...controls.map((c) => [fwName[c.framework_id], c.ref, c.title, c.owner_id ? names[c.owner_id] : '', c.status, c.last_reviewed_at, c.notes])]));
  zip.file('devices.csv', toCsv([['name', 'os', 'owner', 'encrypted', 'agent_installed', 'last_seen_on'],
    ...devices.map((d) => [d.name, d.os, d.owner_id ? names[d.owner_id] : '', String(d.encrypted), String(d.agent_installed), d.last_seen_on])]));
  zip.file('dsar_requests.csv', toCsv([['requester_email', 'type', 'status', 'due_on'], ...dsars.map((d) => [d.requester_email, d.type, d.status, d.due_on])]));

  const missing: string[] = [];
  if (evidence.length && hasServiceRole()) {
    const admin = getAdminClient();
    for (const e of evidence.slice(0, 200)) {
      const { data, error } = await admin.storage.from('evidence').download(e.file_path);
      if (error || !data) { missing.push(`${e.file_name}: ${error?.message ?? 'not found'}`); continue; }
      zip.file(`evidence/${(controls.find((c) => c.id === e.control_id)?.ref ?? 'control').replace(/[^\w.()-]/g, '_')}/${e.file_name}`, Buffer.from(await data.arrayBuffer()));
    }
  }
  if (missing.length) zip.file('evidence/_MISSING.txt', `These evidence files could not be fetched:\n${missing.join('\n')}\n`);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await audit(req, ctx.org.id, ctx.user.id, 'export.audit_package', { type: 'organization', id: ctx.org.id }, { controls: controls.length, evidence: evidence.length - missing.length });
  return new Response(new Uint8Array(buf), { headers: {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${ctx.org.slug}-audit-package-${generated.toISOString().slice(0, 10)}.zip"`,
    'cache-control': 'no-store',
  } });
});
