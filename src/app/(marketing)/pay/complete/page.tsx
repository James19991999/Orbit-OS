import type { Metadata } from 'next';
import { PaidContent } from '@/components/marketing/PaidContent';

export const metadata: Metadata = { title: 'Payment received', robots: { index: false } };

export default function PayComplete() {
  return <PaidContent />;
}
