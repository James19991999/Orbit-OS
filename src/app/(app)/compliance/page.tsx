import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { readiness, daysUntil } from '@/lib/compliance/readiness';
import { can } from '@/lib/roles';
import { planAllows, PLANS } from '@/lib/billing/plans';

import { auditLabel } from '@/lib/audit-labels';
import { Card, CardHeader, Icon, Pill, EmptyState, ProgressBar, Banner } from '@/components/ui';
import { EnableFramework, DsarTracker, DeviceActions, TrainingActions } from '@/components/compliance/ComplianceActions';
import { Vault } from '@/components/compliance/Vault';
import type { Framework, Control, Device, Dsar, TrainingCampaign, TrainingAssignment, AuditEntry, VaultDoc } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export const metadata: Metadata = { title: 'Compliance' };

const FW_ICON: Record<string, string> = { soc2: 'domain_verification', gdpr: 'shield_with_heart', iso27001: 'enhanced_encryption', hipaa: 'health_and_safety', custom: 'rule' };

export default async function CompliancePage() {
  const fmt = await getFormat();
  const { supabase, org, role, user, aal } = await requireAppContext();
  const members = await loadMembers(supabase, org.id);
  const people = nameMap(members);
  const [fwRes, ctrlRes, devRes, dsarRes, campRes, logRes, vaultRes] = await Promise.all([
    supabase.from('compliance_frameworks').select('*').eq('org_id', org.id).order('created_at'),
    supabase.from('compliance_controls').select('id, framework_id, status').eq('org_id', org.id),
    supabase.from('devices').select('*').eq('org_id', org.id).order('name'),
    supabase.from('dsar_requests').select('*').eq('org_id', org.id).order('due_on'),
    supabase.from('training_campaigns').select('*').eq('org_id', org.id).order('due_on', { ascending: false }).limit(1),
    can.seeAudit(role) ? supabase.from('audit_log').select('*').eq('org_id', org.id).or('action.like.auth.%,action.like.member.%,action.like.org.%,action.like.billing.%,action.like.export.%,action.like.compliance.%').order('created_at', { ascending: false }).limit(12) : Promise.resolve({ data: [], error: null }),
    can.manage(role) ? supabase.from('vault_documents').select('*').eq('org_id', org.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const frameworks = must(fwRes, 'frameworks') as Framework[];
  const controls = must(ctrlRes, 'controls') as Pick<Control, 'id' | 'framework_id' | 'status'>[];
  const devices = must(devRes, 'devices') as Device[];
  const dsars = must(dsarRes, 'DSARs') as Dsar[];
  const campaign = (must(campRes, 'training') as TrainingCampaign[])[0] ?? null;
  const assignments = campaign ? must(await supabase.from('training_assignments').select('*').eq('campaign_id', campaign.id), 'assignments') as TrainingAssignment[] : [];
  const log = must(logRes, 'security log') as AuditEntry[];
  const overall = readiness(controls);
  const nextAudit = frameworks.map((f) => daysUntil(f.target_date)).filter((d): d is number => d !== null && d >= 0).sort((a, b) => a - b)[0];
  const compliantDevices = devices.filter((d) => d.encrypted && d.agent_installed);
  const passed = assignments.filter((a) => a.completed_at).length;
  const auditPack = planAllows(org.plan, 'auditPackage') && (can.manage(role) || role === 'auditor');

  return (
    <div className="flex flex-col gap-5">
      <Card glow>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant"><Icon name="verified_user" className="text-[16px]" />Audit readiness · tracked controls</p>
            <h1 className="mt-1 text-headline-lg-mobile md:text-headline-lg">Compliance & Security</h1>
            <p className="mt-2 text-headline-xl leading-none tnum">{overall.total ? `${overall.pct}%` : '—'}</p>
            <p className="mt-2 text-body-md text-on-surface-variant">
              {overall.total ? `${overall.passing} of ${overall.total} applicable controls passing · ${overall.failing} failing · ${overall.inReview} in review` : 'Enable a framework to start tracking controls.'}
              {nextAudit !== undefined && <> · next external audit in <strong className="text-on-surface tnum">{nextAudit} days</strong></>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {auditPack
              ? <a href="/api/compliance/audit-package" className="inline-flex h-10 items-center gap-2 rounded bg-primary-container px-4 text-label-md text-white shadow-bevel"><Icon name="folder_zip" className="text-[18px]" />Download audit-ready package (ZIP)</a>
              : <p className="max-w-xs text-right text-body-sm text-on-surface-variant">The audit-ready package is included on {PLANS.enterprise.name}.</p>}
            {can.manage(role) && <EnableFramework orgId={org.id} enabledKeys={frameworks.map((f) => f.key)} limit={PLANS[org.plan].limits.frameworks} />}
          </div>
        </div>
        <p className="mt-4 text-body-sm text-on-surface-variant">OrbitOS tracks your compliance work — owners, statuses and evidence. It doesn&apos;t certify compliance; your auditor does.</p>
      </Card>

      {frameworks.length === 0 ? <EmptyState icon="rule" title="No frameworks enabled" body={can.manage(role) ? 'Enable SOC 2, GDPR, ISO 27001 or HIPAA to get a starter control set.' : 'An owner or director can enable frameworks.'} /> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {frameworks.map((f) => {
            const r = readiness(controls.filter((c) => c.framework_id === f.id));
            const tone = r.pct >= 95 ? 'healthy' : r.pct >= 70 ? 'warning' : 'alert';
            return (
              <li key={f.id}>
                <Link href={`/compliance/frameworks/${f.id}`} className="card block p-5 transition-colors hover:border-outline">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="flex items-center gap-2 text-headline-sm"><Icon name={FW_ICON[f.key]} className="text-secondary" />{f.name}</h2>
                      {f.description && <p className="text-body-sm text-on-surface-variant">{f.description}</p>}
                    </div>
                    <Pill tone={tone}>{r.pct}%</Pill>
                  </div>
                  <div className="mt-4"><ProgressBar value={r.passing} max={r.total} label={`${f.name} controls passing`} tone={tone} /></div>
                  <p className="mt-2 text-body-sm text-on-surface-variant tnum">{r.passing}/{r.total} passing{r.failing ? ` · ${r.failing} failing` : ''}{r.inReview ? ` · ${r.inReview} in review` : ''}{r.notStarted ? ` · ${r.notStarted} not started` : ''}{f.policy_version ? ` · policy v${f.policy_version}` : ''}</p>
                  {f.key === 'gdpr' && <p className="mt-1 text-body-sm text-on-surface-variant">{dsars.filter((d) => d.status !== 'closed').length} DSAR requests pending</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <Card>
          <CardHeader title="Data subject requests" icon="person_search" subtitle="GDPR Art. 15–20 · 30-day deadline" />
          <DsarTracker orgId={org.id} items={dsars} canManage={can.manage(role)} />
        </Card>
        <Card>
          <CardHeader title="Hardware fleet" icon="laptop_mac" subtitle="Encrypted + endpoint agent installed" action={can.manage(role) ? <DeviceActions orgId={org.id} people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name, email: m.profile.email }))} /> : undefined} />
          <p className="text-headline-md tnum">{compliantDevices.length} / {devices.length} <span className="text-body-sm text-on-surface-variant">compliant</span></p>
          <div className="mt-2"><ProgressBar value={compliantDevices.length} max={devices.length} label="Devices compliant" tone={compliantDevices.length === devices.length ? 'healthy' : 'warning'} /></div>
          {devices.length > compliantDevices.length && (
            <ul className="mt-3 text-body-sm">
              {devices.filter((d) => !(d.encrypted && d.agent_installed)).map((d) => (
                <li key={d.id} className="flex justify-between gap-2 py-1"><span>{d.name}{d.owner_id ? ` · ${people[d.owner_id]?.name ?? ''}` : ''}</span><span className="text-warning">{!d.encrypted ? 'Not encrypted' : 'No agent'}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Security awareness training" icon="school" subtitle={campaign ? `${campaign.title} · due ${fmt.date(campaign.due_on)}` : 'No campaign running'} />
          {campaign ? (
            <>
              <p className="text-headline-md tnum">{assignments.length ? Math.round((passed / assignments.length) * 100) : 0}% <span className="text-body-sm text-on-surface-variant">{passed} of {assignments.length} completed</span></p>
              <div className="my-2"><ProgressBar value={passed} max={assignments.length} label="Training completion" tone="healthy" /></div>
            </>
          ) : <p className="mb-2 text-body-sm text-on-surface-variant">Assign a campaign to the whole team.</p>}
          <TrainingActions campaignId={campaign?.id ?? null} remaining={assignments.length - passed} canManage={can.manage(role)}
            myAssignment={assignments.find((a) => a.user_id === user.id) ?? null} orgId={org.id} members={members.map((m) => m.user_id)} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        {can.manage(role) && (
          <Card>
            <CardHeader title="Sensitive legal & IP vault" icon="lock" subtitle="Owners and directors · MFA required to open" />
            <Vault orgId={org.id} docs={must(vaultRes, 'vault') as VaultDoc[]} aal2={aal.current === 'aal2'} />
          </Card>
        )}
        {can.seeAudit(role) ? (
          <Card>
            <CardHeader title="Security log" icon="gpp_maybe" subtitle="Sign-ins, access changes, exports and billing events"
              action={<Link href="/settings/audit-log" className="text-label-sm text-primary hover:underline">Full audit log</Link>} />
            {log.length === 0 ? <EmptyState icon="shield" title="No security events yet" /> : (
              <ul className="divide-y divide-outline-variant">
                {log.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-body-sm">
                    <span className="min-w-0">
                      <span className={`font-medium ${e.action.includes('failed') ? 'text-alert' : 'text-on-surface'}`}>{auditLabel(e.action)}{e.target_type === 'membership' && e.target_id && people[e.target_id] ? `: ${people[e.target_id].name}` : ''}</span>
                      <span className="block truncate text-on-surface-variant">{e.actor_id ? `by ${people[e.actor_id]?.name ?? 'member'}` : 'System'}{e.ip ? ` · ${e.ip}` : ''}{e.metadata && 'email' in e.metadata ? ` · ${String(e.metadata.email)}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-on-surface-variant">{fmt.relative(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : <Banner tone="info">The security log is visible to owners, directors and auditors.</Banner>}
      </div>
    </div>
  );
}
