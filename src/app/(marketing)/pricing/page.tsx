import type { Metadata } from 'next';
import { PricingTable } from '@/components/marketing/PricingTable';

export const metadata: Metadata = { title: 'Pricing', description: 'OrbitOS plans in KES, USD, EUR and GBP. Pay with M-Pesa or card through IntaSend.' };

const FAQ = [
  ['How do I pay?', 'Through IntaSend: M-Pesa (STK push to your phone, charged in KES) or card in your workspace currency (KES, USD, EUR or GBP). Every payment covers one month or one year.'],
  ['Does it renew automatically?', 'No. M-Pesa payments can’t be charged without you, so we email reminders 7 days and 3 days before your plan ends, and on the day itself. After a 3-day grace period the workspace becomes read-only until you renew — nothing is deleted.'],
  ['What happens during the trial?', 'You get Pro for 14 days with no payment details needed.'],
  ['Can I add seats?', 'Enterprise includes 200 seats and adds blocks of 10. Owners can turn on an alert for when 95% of seats are in use (Settings → Plan & billing).'],
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">Pricing</h1>
      <p className="mt-2 max-w-2xl text-body-lg text-on-surface-variant">Prices per workspace. Annual plans include two months free.</p>
      <div className="mt-8"><PricingTable /></div>
      <section aria-labelledby="faq-h" className="mt-14 max-w-3xl">
        <h2 id="faq-h" className="text-headline-md">Questions</h2>
        <dl className="mt-4 divide-y divide-outline-variant">
          {FAQ.map(([q, a]) => <div key={q} className="py-4"><dt className="text-label-md">{q}</dt><dd className="mt-1 text-body-md text-on-surface-variant">{a}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}
