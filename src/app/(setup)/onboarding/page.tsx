import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/context';
import { OnboardingForm } from '@/components/auth/OnboardingForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('onb.title') };
}

export default async function OnboardingPage(props: { searchParams: Promise<{ new?: string }> }) {
  const searchParams = await props.searchParams;
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login?next=/onboarding');
  if (ctx.memberships.length > 0 && !searchParams.new) redirect('/dashboard');
  return <OnboardingForm userId={ctx.user.id} defaultName={ctx.profile.full_name} hasWorkspaces={ctx.memberships.length > 0} />;
}
