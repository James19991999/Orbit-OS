'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAmount, formatMoney, type Currency } from '@/lib/format';

/** Completed plan payments per month for one currency (last 12 months, empty months shown as 0). */
export function RevenueChart({ currency, months }: { currency: string; months: { month: string; label: string; amount_minor: number }[] }) {
  const cur = currency as Currency;
  return (
    <figure aria-label={`Revenue per month in ${currency}`}>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <BarChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-outline-variant))" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'rgb(var(--c-on-surface-variant))', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => formatAmount(v, { compact: true })} tick={{ fill: 'rgb(var(--c-on-surface-variant))', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip formatter={(v) => formatMoney(Number(v), cur)} cursor={{ fill: 'rgb(var(--c-on-surface) / 0.05)' }}
              contentStyle={{ background: 'rgb(var(--c-surface-container-high))', border: '1px solid rgb(var(--c-outline-variant))', borderRadius: 8, color: 'rgb(var(--c-on-surface))' }}
              itemStyle={{ color: 'rgb(var(--c-on-surface))' }} labelStyle={{ color: 'rgb(var(--c-on-surface-variant))' }} />
            <Bar dataKey="amount_minor" name={currency} fill="rgb(var(--c-primary))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{months.map((m) => `${m.label}: ${formatMoney(m.amount_minor, cur)}`).join('; ')}</figcaption>
    </figure>
  );
}
