import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui';

export const metadata: Metadata = { title: 'Payment received', robots: { index: false } };

export default function PayComplete() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <Icon name="check_circle" className="text-[48px] text-healthy" />
      <h1 className="mt-3 text-headline-lg">Thank you</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">Your payment is being confirmed by IntaSend. You&apos;ll get a receipt by email, and the invoice updates automatically once M-Pesa or your card issuer confirms.</p>
      <Link href="/" className="mt-6 inline-block text-primary hover:underline">Return to OrbitOS</Link>
    </div>
  );
}
