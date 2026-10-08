import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { isSupabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/auth/SetupNotice';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; reason?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return <LoginForm next={searchParams.next} reason={searchParams.reason} error={searchParams.error} />;
}
