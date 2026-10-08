import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/SignupForm';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Create your workspace' };

export default async function SignupPage(props: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const searchParams = await props.searchParams;
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return <SignupForm next={searchParams.next} invitedEmail={searchParams.email} />;
}
