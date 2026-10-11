import type { Metadata } from 'next';
import { requireAppContext } from '@/lib/context';
import { must } from '@/lib/data/members';
import { getT } from '@/i18n/server';
import { LanguageSelect } from '@/components/shell/LanguageSelect';
import { Card, CardHeader } from '@/components/ui';
import { PersonalForm, NotificationPrefs, SecurityPanel, RegionFormat, DataSaverToggle } from '@/components/profile/ProfileForms';
import { LOCALE_COOKIE } from '@/lib/locale';
import { cookies } from 'next/headers';
import { WhatsAppPanel } from '@/components/profile/WhatsAppPanel';
import { CalendarPanel } from '@/components/profile/CalendarPanel';
import { isProviderConfigured } from '@/lib/calendar/providers';
import { isEncryptionConfigured } from '@/lib/crypto/secrets';
import { isWhatsAppConfigured, maskPhone } from '@/lib/whatsapp/client';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('profile.title') };
}

export default async function ProfilePage() {
  const [{ supabase, profile, user, role, org, aal }, t] = await Promise.all([requireAppContext(), getT()]);
  // One round trip. Own calendar connection: RLS + column grants, never the tokens.
  const [{ data: wa }, { data: cal }, pkRes, regionCookie] = await Promise.all([
    supabase.from('whatsapp_links').select('phone').eq('user_id', user.id).maybeSingle(),
    supabase.from('calendar_connections').select('provider, account_email, status, last_error, busy_synced_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('passkeys').select('id, label, created_at').eq('user_id', user.id).order('created_at'),
    cookies(),
  ]);
  const calOn = isEncryptionConfigured();
  const passkeys = must(pkRes, 'passkeys') as { id: string; label: string; created_at: string }[];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('profile.title')}</h1>
        <p className="text-body-md text-on-surface-variant">{user.email} · {t('profile.at', { role: t(`role.${role}`), org: org.name })}</p>
      </div>
      <Card><CardHeader title={t('profile.personal')} icon="person" subtitle={t('profile.personal_sub')} /><PersonalForm profile={profile} /></Card>
      <Card id="language"><CardHeader title={t('profile.language')} icon="translate" subtitle={t('profile.language_sub')} /><div className="flex flex-col gap-3"><LanguageSelect userId={user.id} /><p className="text-body-sm text-on-surface-variant">{t('profile.language_note')}</p></div></Card>
      <Card><CardHeader title={t('profile.region')} icon="language" subtitle={t('profile.region_sub')} /><RegionFormat saved={regionCookie.get(LOCALE_COOKIE)?.value ?? ''} /></Card>
      <Card id="data"><CardHeader title={t('profile.data')} icon="network_check" subtitle={t('profile.data_sub')} /><DataSaverToggle userId={user.id} enabled={profile.data_saver} /></Card>
      <Card id="calendar"><CardHeader title={t('cal.title')} icon="calendar_month" subtitle={t('cal.sub')} />
        <CalendarPanel providers={{ google: calOn && isProviderConfigured('google'), microsoft: calOn && isProviderConfigured('microsoft') }}
          connection={cal ? { provider: cal.provider, accountEmail: cal.account_email, status: cal.status, lastError: cal.last_error, busySyncedAt: cal.busy_synced_at } : null} />
      </Card>
      <Card id="whatsapp"><CardHeader title={t('profile.whatsapp')} icon="chat" subtitle={t('profile.whatsapp_sub')} /><WhatsAppPanel userId={user.id} linkedPhone={wa?.phone ? maskPhone(wa.phone) : null} checkins={profile.whatsapp_checkins} approvals={profile.whatsapp_approvals} configured={isWhatsAppConfigured()} /></Card>
      <Card><CardHeader title={t('profile.notifications')} icon="notifications" /><NotificationPrefs profile={profile} /></Card>
      <Card id="security"><CardHeader title={t('profile.security')} icon="shield_lock" /><SecurityPanel passkeys={passkeys} aal={aal.current} /></Card>
    </div>
  );
}
