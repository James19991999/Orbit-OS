import Link from 'next/link';
import { Icon } from '@/components/ui';
import { PricingTable } from '@/components/marketing/PricingTable';

const FEATURES = [
  { icon: 'grid_view', title: 'Executive dashboard', body: 'A Company Health Index built from your own sprints, runway, check-ins and controls — with the formula shown, not hidden.' },
  { icon: 'view_kanban', title: 'Operations & runway', body: 'Sprints and a Kanban board, burn and runway, approvals, recorded payroll, and client invoices paid by M-Pesa or card.' },
  { icon: 'schedule', title: 'Time-zone scheduling', body: 'Live team matrix, a computed golden overlap window, and a slot finder that never books someone at 3 AM.' },
  { icon: 'auto_awesome', title: 'Culture that travels', body: 'Lounges with a shared focus timer, pulse polls, async roll call, channels and peer kudos.' },
  { icon: 'verified_user', title: 'Compliance tracking', body: 'SOC 2, GDPR, ISO 27001 and HIPAA control sets, evidence, devices, training and an audit-ready ZIP.' },
  { icon: 'analytics', title: 'Board-ready reports', body: 'PDF dossiers, CSV dumps, Slack dispatch and scheduled digests — every number traceable to your data.' },
];

export default function Landing() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.22),transparent_65%)]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 md:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-label-xs uppercase text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-healthy" aria-hidden />Built for remote-first companies in Africa and beyond
          </p>
          <h1 className="mt-5 max-w-3xl text-headline-lg-mobile md:text-headline-xl">The distributed operating system for remote-first companies</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-on-surface-variant">
            One calm cockpit for founders and operations leaders: health, runway, sprints, time zones, culture and compliance — across every city your team works from.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded bg-primary-container px-5 text-label-md text-white shadow-bevel hover:bg-[#1d4ed8]">Start 14-day free trial<Icon name="arrow_forward" className="text-[18px]" /></Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded border border-outline-variant bg-surface-container px-5 text-label-md">Sign in</Link>
          </div>
          <p className="mt-3 text-body-sm text-on-surface-variant">Pay with M-Pesa in KES, or by card in KES, USD, EUR or GBP. No auto-renewing surprises.</p>
        </div>
      </section>
      <section id="features" aria-labelledby="features-h" className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="features-h" className="text-headline-lg-mobile md:text-headline-lg">Everything a distributed company runs on</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="card p-5">
              <Icon name={f.icon} className="text-[28px] text-primary" />
              <h3 className="mt-3 text-headline-sm">{f.title}</h3>
              <p className="mt-1 text-body-md text-on-surface-variant">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="pricing-h" className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="pricing-h" className="text-headline-lg-mobile md:text-headline-lg">Simple pricing</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">Annual plans include two months free.</p>
        <div className="mt-8"><PricingTable /></div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="card glow-focal flex flex-col items-start gap-4 p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-headline-md">Bring your team into orbit</h2>
            <p className="text-body-md text-on-surface-variant">Set up in minutes. Invite teammates with a link.</p>
          </div>
          <Link href="/signup" className="inline-flex h-12 items-center rounded bg-primary-container px-5 text-label-md text-white">Create your workspace</Link>
        </div>
      </section>
    </>
  );
}
