import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext } from '@/lib/context';
import { loadMembers, must } from '@/lib/data/members';
import { can } from '@/lib/roles';
import { planAllows, PLANS } from '@/lib/billing/plans';
import { isEmailConfigured } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { Card, Icon, Pill, Stat, LinkButton } from '@/components/ui';
import { SettingsFilter, Section } from '@/components/settings/Filter';
import { OrgForm, LegalEntities, AuthSettings, TimezoneEngine, GovernanceActions } from '@/components/settings/OrgSettings';
import { Members } from '@/components/settings/Members';
import { Integrations } from '@/components/settings/Integrations';
import pkg from '../../../../package.json';
import type { LegalEntity, Role } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { loadConfig, publicConfig } from '@/lib/etims/service';
import { isEncryptionConfigured } from '@/lib/crypto/secrets';
import { isProviderConfigured } from '@/lib/calendar/providers';
import { EtimsSettings } from '@/components/settings/EtimsSettings';
import { getT } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.set.title') };
}

export default async function SettingsPage() {
  const [fmt, t, { supabase, org, role, user, aal }] = await Promise.all([getFormat(), getT(), requireAppContext()]);
  const members = await loadMembers(supabase, org.id);
  const [entRes, invRes, integRes] = await Promise.all([
    supabase.from('legal_entities').select('*').eq('org_id', org.id).order('is_primary', { ascending: false }),
    can.manage(role) ? supabase.from('invites').select('id, email, role, expires_at, code').eq('org_id', org.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    can.manage(role) ? supabase.from('integrations').select('kind, enabled').eq('org_id', org.id) : Promise.resolve({ data: [], error: null }),
  ]);
  const integ = must(integRes, 'integrations') as { kind: string; enabled: boolean }[];
  // KRA eTIMS: config and document counts are server-only tables (the communication key never leaves the server).
  let etims: { config: ReturnType<typeof publicConfig>; counts: { submitted: number; queued: number; rejected: number } } | null = null;
  if (can.seeFinance(role) && hasServiceRole()) {
    const admin = getAdminClient();
    const [cfg, { data: docs }] = await Promise.all([loadConfig(admin, org.id), admin.from('etims_documents').select('status').eq('scope', org.id)]);
    const counts = { submitted: 0, queued: 0, rejected: 0 };
    for (const d of docs ?? []) if (d.status in counts) counts[d.status as keyof typeof counts]++;
    etims = { config: publicConfig(cfg), counts };
  }
  const zones = new Set(members.map((m) => m.profile.timezone)).size;
  const invites = must(invRes, 'invites') as { id: string; email: string; role: Role; expires_at: string; code: string }[];
  const expires = new Date(org.plan_expires_at);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'orbitos.io';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label-xs uppercase text-on-surface-variant">{t('p.set.kicker')}</p>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('p.set.h1')}</h1>
        </div>
        {can.seeAudit(role) && <LinkButton href="/settings/audit-log" variant="secondary" icon="history">{t('p.set.audit')}</LinkButton>}
      </div>

      <Card glow>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-headline-md">{org.legal_name || org.name}</h2>
            <p className="font-mono text-body-sm text-on-surface-variant">{org.slug}.{root}</p>
          </div>
          <Pill tone={org.status === 'active' ? 'healthy' : 'warning'}>{t(`p.set.status.${org.status}`)}</Pill>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={t('p.set.seats')} value={`${members.length} / ${org.seat_limit}`} sub={t('p.set.available', { n: Math.max(0, org.seat_limit - members.length) })} />
          <Stat label={t('p.set.zones')} value={zones} sub={t('p.set.across')} />
          <Stat label={t('p.set.plan')} value={<span className="capitalize">{PLANS[org.plan].name}</span>} sub={org.plan_period === 'trial' ? t('p.set.trial') : org.plan_period === 'annual' ? t('p.set.annual') : t('p.set.monthly')} />
          <Stat label={expires.getTime() < Date.now() ? t('p.set.expired') : t('p.set.paid_through')} value={fmt.date(expires)} sub={t('p.set.intasend')} />
        </div>
        {role === 'owner' && <div className="mt-4"><LinkButton href="/settings/billing" icon="credit_card" size="sm">{t('p.set.manage')}</LinkButton></div>}
      </Card>

      <SettingsFilter>
        <div className="mt-4 grid gap-4 xl:grid-cols-2 xl:items-start">
          <Section id="organization" title={t('p.set.s.org')} icon="apartment" keywords="name legal currency threshold approval cost">
            <OrgForm org={org} canEdit={can.manage(role)} />
          </Section>
          <Section id="entities" title={t('p.set.s.entities')} icon="account_balance" keywords="entities legal subsidiaries jurisdiction" badge={<span className="text-body-sm text-on-surface-variant">{t('p.set.n_entities', { count: (entRes.data ?? []).length })}</span>}>
            <LegalEntities orgId={org.id} items={must(entRes, 'entities') as LegalEntity[]} canEdit={can.manage(role)} />
          </Section>
          <Section id="auth" title={t('p.set.s.auth')} icon="fingerprint" keywords="sso saml okta mfa two-factor session timeout security" badge={org.enforce_mfa_admins ? <Pill tone="healthy">{t('p.set.strict')}</Pill> : undefined}>
            <AuthSettings org={org} isOwner={role === 'owner'} ssoAllowed={org.plan === 'enterprise'} />
          </Section>
          <Section id="timezone" title={t('p.set.s.tz')} icon="schedule_send" keywords="core window overlap quiet hours time zone travel">
            <TimezoneEngine org={org} canEdit={can.manage(role)} />
          </Section>
          {can.manage(role) && (
            <Section id="integrations" title={t('p.set.s.integ')} icon="hub" keywords="slack github calendar email cloudtrail webhook" badge={<span className="text-body-sm text-on-surface-variant">{t('p.set.n_connected', { n: integ.filter((i) => i.enabled).length })}</span>}>
              <Integrations slack={integ.some((i) => i.kind === 'slack_webhook' && i.enabled)} github={integ.some((i) => i.kind === 'github' && i.enabled)} emailConfigured={isEmailConfigured()} canEdit={can.manage(role)}
                calendarSync={isEncryptionConfigured() && (isProviderConfigured('google') || isProviderConfigured('microsoft'))} />
            </Section>
          )}
          {etims && (
            <Section id="etims" title={t('etims.title')} icon="receipt_long" keywords="kra etims tax vat invoice fiscal oscu kenya pin"
              badge={etims.config?.status === 'active' ? <Pill tone="healthy">{t('etims.status.active')}</Pill> : undefined}>
              <EtimsSettings config={etims.config} counts={etims.counts} encryptionConfigured={isEncryptionConfigured()} isOwner={role === 'owner'} canWrite={can.manage(role) && org.status === 'active'} />
            </Section>
          )}
          <Section id="data" title={t('p.set.s.data')} icon="gavel" keywords="residency retention archive export offboarding suspension delete">
            <dl className="mb-4 grid gap-3 text-body-md sm:grid-cols-2">
              <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.set.residency')}</dt><dd>{process.env.NEXT_PUBLIC_DATA_REGION || t('p.set.residency_default')}</dd></div>
              <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.set.retention')}</dt><dd>{t('p.set.retention_v', { n: org.audit_retention_years })}</dd></div>
            </dl>
            <GovernanceActions slug={org.slug} isOwner={role === 'owner'} archiveAllowed={planAllows(org.plan, 'tenantArchive')} offboarding={org.status === 'offboarding'} deletionAt={org.deletion_scheduled_at} aal2={aal.current === 'aal2'} />
          </Section>
        </div>
        <div className="mt-4">
          <Section id="members" title={t('p.set.s.members')} icon="admin_panel_settings" keywords="members invite roles rbac team people seats remove">
            <Members members={members.map((m) => ({ user_id: m.user_id, role: m.role, title: m.title, name: m.profile.full_name, email: m.profile.email, avatar: m.profile.avatar_url }))}
              invites={invites} myRole={role} myId={user.id} seatLimit={org.seat_limit} appUrl={appUrl()} />
          </Section>
        </div>
      </SettingsFilter>

      <p className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
        <Icon name="info" className="text-[16px]" />OrbitOS v{pkg.version}{process.env.VERCEL_GIT_COMMIT_SHA ? ` · ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ''} · {t('p.set.footer')} · <Link href="/security" className="underline">{t('p.set.security')}</Link>
      </p>
    </div>
  );
}
