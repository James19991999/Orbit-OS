'use client';
import { useEffect, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { Icon, Select } from '@/components/ui';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { CURRENCIES, CURRENCY_NAMES, formatMoney, type Currency } from '@/lib/format';
import { DEFAULT_LOCALE, currencyForLocale, englishForRegion } from '@/lib/locale';

/**
 * Static page, so the first render is the Kenyan default (KES, en-KE) — identical on server and
 * client. After mount it switches to the visitor's region: US → USD with "$39", UK → GBP, euro area → EUR.
 */
export function PricingTable() {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [currency, setCurrency] = useState<Currency>('KES');
  useEffect(() => {
    try {
      const l = englishForRegion(navigator.language);
      if (l) setLocale(l);
      setCurrency(currencyForLocale(navigator.language));
    } catch { /* keep KES */ }
  }, []);
  const money = (minor: number, c: Currency) => formatMoney(minor, c, { decimals: false, locale });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body-sm text-on-surface-variant">Prices per workspace, before local taxes. Every workspace starts with a 14-day Pro trial.</p>
        <div className="w-full sm:w-64">
          <Select label="Show prices in" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
            options={CURRENCIES.map((c) => ({ value: c, label: `${c} — ${CURRENCY_NAMES[c]}` }))} />
        </div>
      </div>
      <ul className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          return (
            <li key={id} className={`card flex flex-col p-6 ${id === 'pro' ? 'border-primary-container shadow-glow' : ''}`}>
              <h2 className="text-headline-sm">{p.name}</h2>
              <p className="text-body-sm text-on-surface-variant">{p.tagline}</p>
              <p className="mt-4 text-headline-lg tnum">{money(p.monthly[currency], currency)}<span className="text-body-sm text-on-surface-variant"> /month</span></p>
              <p className="text-body-sm text-on-surface-variant tnum">
                {currency === 'KES' ? 'M-Pesa or card' : `By card · or ${money(p.monthly.KES, 'KES')}/month with M-Pesa`}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-body-md">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Icon name="check" className="text-[18px] text-healthy" />{f}</li>)}
              </ul>
              <Link href="/signup" className={`mt-6 inline-flex h-11 items-center justify-center rounded px-4 text-label-md ${id === 'pro' ? 'bg-primary-container text-white' : 'border border-outline-variant bg-surface-container-high'}`}>Start free trial</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
