import { SeatAlertToggle } from '@/components/settings/OrgSettings';
import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext, isWritable } from '@/lib/context';
import { must } from '@/lib/data/members';
import { PLANS } from '@/lib/billing/plans';

import { isIntaSendConfigured } from '@/lib/intasend/client';
import { Card, CardHeader, Icon, Pill, EmptyState, Banner } from '@/components/ui';
import { BillingPlans } from '@/components/billing/BillingPlans';
import { BillingDetails } from '@/components/billing/BillingDetails';
import { getT } from '@/i18n/server';
import { cardCurrencyFor } from '@/lib/intasend/currencies';
import type { BillingPayment } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.bill.title') };
}

export default async function BillingPage() {
  const t = await getT();
  const fmt = await getFormat();
  const { supabase, org, role } = await requireAppContext();
  const canSee = role === 'owner' || role === 'auditor';
  const [paysRes, membersRes] = await Promise.all([
    canSee ? supabase.from('billing_payments').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
    supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'active'),
  ]);
  const payments = must(paysRes, 'payments') as BillingPayment[];
  const expires = new Date(org.plan_expires_at);
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86_400_000);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/settings" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />{t('p.audit.back')}</Link>
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('p.bill.h1')}</h1>
        <p className="text-body-md text-on-surface-variant">
          {PLANS[org.plan].name}{org.plan_period === 'trial' ? t('p.bill.trial') : ''} · {t('p.bill.seats', { n: org.seat_limit })} · {daysLeft >= 0 ? t('p.bill.through', { date: fmt.date(expires, 'long'), n: daysLeft }) : t('p.bill.expired', { n: -daysLeft })}
        </p>
      </div>
      {!isWritable(org) && <Banner tone="warning">{t('p.bill.readonly')}</Banner>}
      {role !== 'owner' && <Banner tone="info">{t('p.bill.owner_only')}</Banner>}
      <Card aria-labelledby="taxdetails-h">
        <CardHeader title={<span id="taxdetails-h">{t('etims.billing.title')}</span>} icon="receipt" />
        <p className="mb-3 text-body-md text-on-surface-variant">{t('etims.billing.body')}</p>
        <BillingDetails kraPin={org.kra_pin} canEdit={role === 'owner' && isWritable(org)} />
      </Card>
      <Card><CardHeader title={t('p.bill.seat_alerts')} icon="group" /><SeatAlertToggle orgId={org.id} enabled={org.seat_autoscale} canEdit={role === 'owner' && isWritable(org)} /></Card>
      <BillingPlans currentPlan={org.plan} currency={cardCurrencyFor(org.currency)} activeMembers={membersRes.count ?? 0} canPay={role === 'owner'} configured={isIntaSendConfigured()} />
      {canSee && (
        <Card>
          <CardHeader title={t('p.bill.history')} icon="receipt_long" subtitle={t('p.bill.history_sub')} />
          {payments.length === 0 ? <EmptyState icon="receipt" title={t('p.bill.none')} /> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-body-md">
                <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant">
                  <th scope="col" className="py-2 pr-3">{t('p.bill.date')}</th><th scope="col" className="py-2 pr-3">{t('p.bill.plan')}</th><th scope="col" className="py-2 pr-3">{t('p.bill.method')}</th><th scope="col" className="py-2 pr-3 text-right">{t('p.bill.amount')}</th><th scope="col" className="py-2 pr-3">{t('p.bill.status')}</th><th scope="col" className="py-2"><span className="sr-only">{t('p.bill.receipt')}</span></th>
                </tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant last:border-0">
                      <td className="py-2 pr-3 tnum">{p.created_at.slice(0, 10)}</td>
                      <td className="py-2 pr-3">{PLANS[p.plan].name} · {t(`bill.p.${p.period}`)} · {t('p.bill.seats', { n: p.seats })}</td>
                      <td className="py-2 pr-3">{p.method === 'MPESA' ? 'M-Pesa' : t('p.bill.card')}</td>
                      <td className="py-2 pr-3 text-right tnum">{fmt.money(p.amount_minor, p.currency)}</td>
                      <td className="py-2 pr-3"><Pill tone={p.state === 'COMPLETE' ? 'healthy' : p.state === 'FAILED' ? 'alert' : 'warning'}>{t(`p.bill.s.${p.state.toLowerCase() as Lowercase<typeof p.state>}`)}</Pill></td>
                      <td className="py-2">{p.state === 'COMPLETE' && <a href={`/api/billing/receipt/${p.id}`} className="text-primary hover:underline">{t('p.bill.receipt')}</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
