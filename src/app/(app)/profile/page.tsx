import type { Metadata } from 'next';
import { requireAppContext } from '@/lib/context';
import { must } from '@/lib/data/members';
import { ROLE_LABEL } from '@/lib/roles';
import { Card, CardHeader } from '@/components/ui';
import { PersonalForm, NotificationPrefs, SecurityPanel, RegionFormat } from '@/components/profile/ProfileForms';
import { LOCALE_COOKIE } from '@/lib/locale';
import { cookies } from 'next/headers';
import { WhatsAppPanel } from '@/components/profile/WhatsAppPanel';
import { isWhatsAppConfigured, maskPhone } from '@/lib/whatsapp/client';

export const metadata: Metadata = { title: 'Profile & security' };

export default async function ProfilePage() {
  const { supabase, profile, user, role, org, aal } = await requireAppContext();
  const { data: wa } = await supabase.from('whatsapp_links').select('phone').eq('user_id', user.id).maybeSingle();
  const passkeys = must(await supabase.from('passkeys').select('id, label, created_at').eq('user_id', user.id).order('created_at'), 'passkeys') as { id: string; label: string; created_at: string }[];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Profile & security</h1>
        <p className="text-body-md text-on-surface-variant">{user.email} · {ROLE_LABEL[role]} at {org.name}</p>
      </div>
      <Card><CardHeader title="Personal details" icon="person" subtitle="Your time zone and working hours drive scheduling, overlap and quiet hours." /><PersonalForm profile={profile} /></Card>
      <Card><CardHeader title="Region format" icon="language" subtitle="How dates, numbers and money are shown to you. The app stays in English." /><RegionFormat saved={(await cookies()).get(LOCALE_COOKIE)?.value ?? ''} /></Card>
      <Card id="whatsapp"><CardHeader title="WhatsApp" icon="chat" subtitle="Check-ins and approvals where your team already is." /><WhatsAppPanel userId={user.id} linkedPhone={wa?.phone ? maskPhone(wa.phone) : null} checkins={profile.whatsapp_checkins} approvals={profile.whatsapp_approvals} configured={isWhatsAppConfigured()} /></Card>
      <Card><CardHeader title="Notifications" icon="notifications" /><NotificationPrefs profile={profile} /></Card>
      <Card id="security"><CardHeader title="Security" icon="shield_lock" /><SecurityPanel passkeys={passkeys} aal={aal.current} /></Card>
    </div>
  );
}
