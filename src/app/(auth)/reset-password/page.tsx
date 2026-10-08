import type { Metadata } from 'next';
import { ResetForm } from '@/components/auth/ResetForm';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Choose a new password' };
export default function Page() {
  return isSupabaseConfigured() ? <ResetForm /> : <SetupNotice />;
}
