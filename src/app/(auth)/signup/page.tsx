import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { SignupForm } from '@/components/auth/SignupForm';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { isSupabaseConfigured } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('signup.title'), description: "Create an OrbitOS workspace for your remote team. 14-day free trial, no card or M-Pesa needed.", alternates: { canonical: '/signup' } };
}

export default async function SignupPage(props: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const searchParams = await props.searchParams;
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return <SignupForm next={searchParams.next} invitedEmail={searchParams.email} />;
}
