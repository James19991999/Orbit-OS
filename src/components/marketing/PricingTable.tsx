import Link from 'next/link';
import { Icon } from '@/components/ui';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { formatMoney } from '@/lib/format';

export function PricingTable() {
  return (
    <ul className="grid gap-4 lg:grid-cols-3">
      {(Object.keys(PLANS) as PlanId[]).map((id) => {
        const p = PLANS[id];
        return (
          <li key={id} className={`card flex flex-col p-6 ${id === 'pro' ? 'border-primary-container shadow-glow' : ''}`}>
            <h3 className="text-headline-sm">{p.name}</h3>
            <p className="text-body-sm text-on-surface-variant">{p.tagline}</p>
            <p className="mt-4 text-headline-lg tnum">{formatMoney(p.monthly.KES, 'KES', { decimals: false })}<span className="text-body-sm text-on-surface-variant"> /month</span></p>
            <p className="text-body-sm text-on-surface-variant tnum">or {formatMoney(p.monthly.USD, 'USD', { decimals: false })}/month by card</p>
            <ul className="mt-4 flex-1 space-y-1.5 text-body-md">
              {p.features.map((f) => <li key={f} className="flex gap-2"><Icon name="check" className="text-[18px] text-healthy" />{f}</li>)}
            </ul>
            <Link href="/signup" className={`mt-6 inline-flex h-11 items-center justify-center rounded px-4 text-label-md ${id === 'pro' ? 'bg-primary-container text-white' : 'border border-outline-variant bg-surface-container-high'}`}>Start free trial</Link>
          </li>
        );
      })}
    </ul>
  );
}
