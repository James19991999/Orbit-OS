'use client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAmount, type Currency } from '@/lib/format';
import { useFormat } from '@/lib/locale/client';
import { useT } from '@/i18n/client';

export function FinanceChart({ months, currency }: { months: { month: string; burn: number; revenue: number }[]; currency: Currency }) {
  const fmt = useFormat();
  const t = useT();
  const data = months.map((m) => ({ ...m, label: fmt.date(m.month + '-01T00:00:00Z', 'month') }));
  return (
    <figure aria-label={t('ops.chart_label')}>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-outline-variant))" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'rgb(var(--c-on-surface-variant))', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => formatAmount(v, { compact: true, locale: fmt.locale })} tick={{ fill: 'rgb(var(--c-on-surface-variant))', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip formatter={(v) => fmt.money(Number(v), currency)} cursor={{ fill: 'rgb(var(--c-on-surface) / 0.05)' }}
              contentStyle={{ background: 'rgb(var(--c-surface-container-high))', border: '1px solid rgb(var(--c-outline-variant))', borderRadius: 8, color: 'rgb(var(--c-on-surface))' }}
              itemStyle={{ color: 'rgb(var(--c-on-surface))' }} labelStyle={{ color: 'rgb(var(--c-on-surface-variant))' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: 'rgb(var(--c-on-surface))' }}>{value}</span>} />
            {/* theme tokens keep bars ≥ 3:1 against the card in both themes (WCAG 1.4.11) */}
            <Bar dataKey="burn" name={t('chart.burn')} fill="rgb(var(--c-warning))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="revenue" name={t('chart.revenue')} fill="rgb(var(--c-primary))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {data.map((d) => t('chart.row', { month: d.label, burn: fmt.money(d.burn, currency), revenue: fmt.money(d.revenue, currency) })).join('; ')}
      </figcaption>
    </figure>
  );
}
