import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAppContext, isWritable } from '@/lib/context';
import { can } from '@/lib/roles';
import { AppShell } from '@/components/shell/AppShell';
import { LocaleProvider } from '@/lib/locale/client';
import { DataSaverProvider } from '@/components/shell/DataSaver';
import { I18nProvider } from '@/i18n/client';
import { getLanguage } from '@/i18n/server';
import { clientMessages } from '@/i18n';
import { getLocale } from '@/lib/locale/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext();
  // Workspace policy: owners/directors must have an MFA-verified session (AAL2).
  if (ctx.org.enforce_mfa_admins && can.manage(ctx.role) && ctx.aal.current !== 'aal2') {
    const path = (await headers()).get('x-orbit-path') || '/dashboard';
    redirect(`/mfa?required=1&next=${encodeURIComponent(path)}`);
  }
  const [locale, lang] = await Promise.all([getLocale(), getLanguage()]);
  return (
    <I18nProvider lang={lang} messages={clientMessages(lang)}>
    <LocaleProvider locale={locale} timeZone={ctx.profile.timezone || 'UTC'}>
    <DataSaverProvider enabled={Boolean(ctx.profile.data_saver)}>
    <AppShell
      user={{ id: ctx.user.id, name: ctx.profile.full_name || ctx.user.email || 'Member', email: ctx.user.email ?? '', avatar: ctx.profile.avatar_url, theme: ctx.profile.theme, timezone: ctx.profile.timezone }}
      org={{ name: ctx.org.name, slug: ctx.org.slug, plan: ctx.org.plan, expiresAt: ctx.org.plan_expires_at, readOnly: !isWritable(ctx.org), timeoutHours: ctx.org.session_timeout_hours, status: ctx.org.status, autoDetectTz: ctx.org.auto_detect_timezone }}
      role={ctx.role}
      workspaces={ctx.memberships.map((m) => ({ name: m.org.name, slug: m.org.slug, role: m.role }))}
    >
      {children}
    </AppShell>
    </DataSaverProvider>
    </LocaleProvider>
    </I18nProvider>
  );
}
