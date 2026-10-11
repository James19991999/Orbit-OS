import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
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
import { getT } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.cmp.title') };
}

const FW_ICON: Record<string, string> = { soc2: 'domain_verification', gdpr: 'shield_with_heart', iso27001: 'enhanced_encryption', hipaa: 'health_and_safety', custom: 'rule' };

export default async function CompliancePage() {
  const [fmt, t, { supabase, org, role, user, aal }] = await Promise.all([getFormat(), getT(), requireAppContext()]);
  // One round trip: members load alongside the page's other queries.
  const [members, fwRes, ctrlRes, devRes, dsarRes, campRes, logRes, vaultRes] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('compliance_frameworks').select('*').eq('org_id', org.id).order('created_at'),
    supabase.from('compliance_controls').select('id, framework_id, status').eq('org_id', org.id),
    supabase.from('devices').select('*').eq('org_id', org.id).order('name'),
    supabase.from('dsar_requests').select('*').eq('org_id', org.id).order('due_on'),
    supabase.from('training_campaigns').select('*').eq('org_id', org.id).order('due_on', { ascending: false }).limit(1),
    can.seeAudit(role) ? supabase.from('audit_log').select('*').eq('org_id', org.id).or('action.like.auth.%,action.like.member.%,action.like.org.%,action.like.billing.%,action.like.export.%,action.like.compliance.%').order('created_at', { ascending: false }).limit(12) : Promise.resolve({ data: [], error: null }),
    can.manage(role) ? supabase.from('vault_documents').select('*').eq('org_id', org.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const people = nameMap(members);
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
            <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant"><Icon name="verified_user" className="text-[16px]" />{t('p.cmp.kicker')}</p>
            <h1 className="mt-1 text-headline-lg-mobile md:text-headline-lg">{t('p.cmp.h1')}</h1>
            <p className="mt-2 text-headline-xl leading-none tnum">{overall.total ? `${overall.pct}%` : '—'}</p>
            <p className="mt-2 text-body-md text-on-surface-variant">
              {overall.total ? t('p.cmp.summary', { passing: overall.passing, total: overall.total, failing: overall.failing, review: overall.inReview }) : t('p.cmp.enable_first')}
              {nextAudit !== undefined && <> · {t('p.cmp.next_audit')} <strong className="text-on-surface tnum">{t('p.cmp.days', { count: nextAudit })}</strong></>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {auditPack
              ? <a href="/api/compliance/audit-package" className="inline-flex h-10 items-center gap-2 rounded bg-primary-container px-4 text-label-md text-white shadow-bevel"><Icon name="folder_zip" className="text-[18px]" />{t('p.cmp.pack')}</a>
              : <p className="max-w-xs text-right text-body-sm text-on-surface-variant">{t('p.cmp.pack_plan', { plan: PLANS.enterprise.name })}</p>}
            {can.manage(role) && <EnableFramework orgId={org.id} enabledKeys={frameworks.map((f) => f.key)} limit={PLANS[org.plan].limits.frameworks} />}
          </div>
        </div>
        <p className="mt-4 text-body-sm text-on-surface-variant">{t('p.cmp.disclaimer')}</p>
      </Card>

      {frameworks.length === 0 ? <EmptyState icon="rule" title={t('p.cmp.no_fw')} body={can.manage(role) ? t('p.cmp.no_fw_manage') : t('p.cmp.no_fw_view')} /> : (
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
                  <div className="mt-4"><ProgressBar value={r.passing} max={r.total} label={t('p.cmp.fw_passing', { name: f.name })} tone={tone} /></div>
                  <p className="mt-2 text-body-sm text-on-surface-variant tnum">{t('p.cmp.passing', { passing: r.passing, total: r.total })}{r.failing ? t('p.cmp.failing', { n: r.failing }) : ''}{r.inReview ? t('p.cmp.review', { n: r.inReview }) : ''}{r.notStarted ? t('p.cmp.not_started', { n: r.notStarted }) : ''}{f.policy_version ? t('p.cmp.policy', { v: f.policy_version }) : ''}</p>
                  {f.key === 'gdpr' && <p className="mt-1 text-body-sm text-on-surface-variant">{t('p.cmp.dsar_pending', { n: dsars.filter((d) => d.status !== 'closed').length })}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <Card>
          <CardHeader title={t('p.cmp.dsar')} icon="person_search" subtitle={t('p.cmp.dsar_sub')} />
          <DsarTracker orgId={org.id} items={dsars} canManage={can.manage(role)} />
        </Card>
        <Card>
          <CardHeader title={t('p.cmp.fleet')} icon="laptop_mac" subtitle={t('p.cmp.fleet_sub')} action={can.manage(role) ? <DeviceActions orgId={org.id} people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name, email: m.profile.email }))} /> : undefined} />
          <p className="text-headline-md tnum">{compliantDevices.length} / {devices.length} <span className="text-body-sm text-on-surface-variant">{t('p.cmp.compliant')}</span></p>
          <div className="mt-2"><ProgressBar value={compliantDevices.length} max={devices.length} label={t('p.cmp.dev_compliant')} tone={compliantDevices.length === devices.length ? 'healthy' : 'warning'} /></div>
          {devices.length > compliantDevices.length && (
            <ul className="mt-3 text-body-sm">
              {devices.filter((d) => !(d.encrypted && d.agent_installed)).map((d) => (
                <li key={d.id} className="flex justify-between gap-2 py-1"><span>{d.name}{d.owner_id ? ` · ${people[d.owner_id]?.name ?? ''}` : ''}</span><span className="text-warning">{!d.encrypted ? t('p.cmp.not_enc') : t('p.cmp.no_agent')}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t('p.cmp.training')} icon="school" subtitle={campaign ? t('p.cmp.due', { title: campaign.title, date: fmt.date(campaign.due_on) }) : t('p.cmp.no_campaign')} />
          {campaign ? (
            <>
              <p className="text-headline-md tnum">{assignments.length ? Math.round((passed / assignments.length) * 100) : 0}% <span className="text-body-sm text-on-surface-variant">{t('p.cmp.completed', { n: passed, total: assignments.length })}</span></p>
              <div className="my-2"><ProgressBar value={passed} max={assignments.length} label={t('p.cmp.tr_completion')} tone="healthy" /></div>
            </>
          ) : <p className="mb-2 text-body-sm text-on-surface-variant">{t('p.cmp.assign_hint')}</p>}
          <TrainingActions campaignId={campaign?.id ?? null} remaining={assignments.length - passed} canManage={can.manage(role)}
            myAssignment={assignments.find((a) => a.user_id === user.id) ?? null} orgId={org.id} members={members.map((m) => m.user_id)} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        {can.manage(role) && (
          <Card>
            <CardHeader title={t('p.cmp.vault')} icon="lock" subtitle={t('p.cmp.vault_sub')} />
            <Vault orgId={org.id} docs={must(vaultRes, 'vault') as VaultDoc[]} aal2={aal.current === 'aal2'} />
          </Card>
        )}
        {can.seeAudit(role) ? (
          <Card>
            <CardHeader title={t('p.cmp.log')} icon="gpp_maybe" subtitle={t('p.cmp.log_sub')}
              action={<Link href="/settings/audit-log" className="text-label-sm text-primary hover:underline">{t('p.cmp.full_log')}</Link>} />
            {log.length === 0 ? <EmptyState icon="shield" title={t('p.cmp.no_events')} /> : (
              <ul className="divide-y divide-outline-variant">
                {log.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-body-sm">
                    <span className="min-w-0">
                      <span className={`font-medium ${e.action.includes('failed') ? 'text-alert' : 'text-on-surface'}`}>{auditLabel(e.action, t)}{e.target_type === 'membership' && e.target_id && people[e.target_id] ? `: ${people[e.target_id].name}` : ''}</span>
                      <span className="block truncate text-on-surface-variant">{e.actor_id ? t('p.cmp.by', { name: people[e.actor_id]?.name ?? t('p.cmp.member') }) : t('p.cmp.system')}{e.ip ? ` · ${e.ip}` : ''}{e.metadata && 'email' in e.metadata ? ` · ${String(e.metadata.email)}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-on-surface-variant">{fmt.relative(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : <Banner tone="info">{t('p.cmp.log_hidden')}</Banner>}
      </div>
    </div>
  );
}
