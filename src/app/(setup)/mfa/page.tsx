import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/context';
import { MfaForm } from '@/components/auth/MfaForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('mfa.enroll_title') };
}

export default async function MfaPage(props: { searchParams: Promise<{ next?: string; required?: string }> }) {
  const searchParams = await props.searchParams;
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login?next=/mfa');
  return <MfaForm next={searchParams.next} required={searchParams.required === '1'} />;
}
