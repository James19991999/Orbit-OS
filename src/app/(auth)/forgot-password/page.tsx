import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { ForgotForm } from '@/components/auth/ForgotForm';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { isSupabaseConfigured } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('forgot.title'), description: "Get a secure link to reset your OrbitOS password.", robots: { index: false, follow: true } };
}
export default function Page() {
  return isSupabaseConfigured() ? <ForgotForm /> : <SetupNotice />;
}
