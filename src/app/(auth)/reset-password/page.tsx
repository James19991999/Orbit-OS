import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { ResetForm } from '@/components/auth/ResetForm';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { isSupabaseConfigured } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('reset.title'), description: "Choose a new password for your OrbitOS account.", robots: { index: false, follow: false } };
}
export default function Page() {
  return isSupabaseConfigured() ? <ResetForm /> : <SetupNotice />;
}
