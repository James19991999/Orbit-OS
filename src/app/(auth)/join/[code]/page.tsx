import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { getAuthContext } from '@/lib/context';
import { getAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { AcceptInvite } from '@/components/auth/AcceptInvite';
import { Banner, LinkButton } from '@/components/ui';
import { getT } from '@/i18n/server';
import type { Role } from '@/lib/types';

export const metadata: Metadata = { title: 'Join workspace' };
export const dynamic = 'force-dynamic';

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

export default async function JoinPage(props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const t = await getT();
  type InviteRow = { email: string; role: Role; expires_at: string; accepted_at: string | null; org: { name: string } };
  let invite: InviteRow | null = null;
  if (hasServiceRole() && /^[A-Za-z0-9_-]{16,64}$/.test(params.code)) {
    const { data } = await getAdminClient().from('invites').select('email, role, expires_at, accepted_at, org:organizations(name)').eq('code', params.code).maybeSingle();
    invite = data as unknown as InviteRow | null;
  }
  if (!invite) return <Banner tone="alert">{t('join.invalid')}</Banner>;
  if (invite.accepted_at) return <Banner tone="info">{t('join.used')} <Link href="/login" className="underline">{t('auth.sign_in')}</Link></Banner>;
  if (new Date(invite.expires_at) < new Date()) return <Banner tone="alert">{t('join.expired')}</Banner>;

  const ctx = await getAuthContext();
  const next = `/join/${params.code}`;
  return (
    <div className="flex flex-col gap-5 text-center">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('join.title', { org: invite.org.name })}</h1>
      <p className="text-body-md text-on-surface-variant">{t('join.invited_as', { role: t(`role.${invite.role}`), email: maskEmail(invite.email) })}</p>
      {ctx ? (
        <AcceptInvite code={params.code} signedInAs={ctx.user.email ?? ''} />
      ) : (
        <div className="flex flex-col gap-2">
          <LinkButton href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}>{t('join.create')}</LinkButton>
          <LinkButton href={`/login?next=${encodeURIComponent(next)}`} variant="secondary">{t('join.have_account')}</LinkButton>
        </div>
      )}
    </div>
  );
}
