import type { Metadata } from 'next';
import { ForgotForm } from '@/components/auth/ForgotForm';
import { SetupNotice } from '@/components/auth/SetupNotice';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Reset password' };
export default function Page() {
  return isSupabaseConfigured() ? <ForgotForm /> : <SetupNotice />;
}
