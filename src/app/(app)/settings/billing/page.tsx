import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAppContext, isWritable } from '@/lib/context';
import { must } from '@/lib/data/members';
import { PLANS } from '@/lib/billing/plans';
import { formatMoney } from '@/lib/format';
import { isIntaSendConfigured } from '@/lib/intasend/client';
import { Card, CardHeader, Icon, Pill, EmptyState, Banner } from '@/components/ui';
import { BillingPlans } from '@/components/billing/BillingPlans';
import type { BillingPayment } from '@/lib/types';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage() {
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
      <Link href="/settings" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />Settings</Link>
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Plan & billing</h1>
        <p className="text-body-md text-on-surface-variant">
          {PLANS[org.plan].name}{org.plan_period === 'trial' ? ' trial' : ''} · {org.seat_limit} seats · {daysLeft >= 0 ? `paid through ${expires.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} (${daysLeft} days)` : `expired ${-daysLeft} days ago`}
        </p>
      </div>
      {!isWritable(org) && <Banner tone="warning">The workspace is read-only until the plan is renewed.</Banner>}
      {role !== 'owner' && <Banner tone="info">Only workspace owners can change the plan.</Banner>}
      <BillingPlans currentPlan={org.plan} currency={org.currency} activeMembers={membersRes.count ?? 0} canPay={role === 'owner'} configured={isIntaSendConfigured()} />
      {canSee && (
        <Card>
          <CardHeader title="Payment history" icon="receipt_long" subtitle="Processed by IntaSend" />
          {payments.length === 0 ? <EmptyState icon="receipt" title="No payments yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-md">
                <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant">
                  <th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="py-2 pr-3">Plan</th><th scope="col" className="py-2 pr-3">Method</th><th scope="col" className="py-2 pr-3 text-right">Amount</th><th scope="col" className="py-2 pr-3">Status</th><th scope="col" className="py-2"><span className="sr-only">Receipt</span></th>
                </tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant last:border-0">
                      <td className="py-2 pr-3 tnum">{p.created_at.slice(0, 10)}</td>
                      <td className="py-2 pr-3">{PLANS[p.plan].name} · {p.period} · {p.seats} seats</td>
                      <td className="py-2 pr-3">{p.method === 'MPESA' ? 'M-Pesa' : 'Card'}</td>
                      <td className="py-2 pr-3 text-right tnum">{formatMoney(p.amount_minor, p.currency)}</td>
                      <td className="py-2 pr-3"><Pill tone={p.state === 'COMPLETE' ? 'healthy' : p.state === 'FAILED' ? 'alert' : 'warning'}>{p.state.toLowerCase()}</Pill></td>
                      <td className="py-2">{p.state === 'COMPLETE' && <a href={`/api/billing/receipt/${p.id}`} className="text-primary hover:underline">Receipt</a>}</td>
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
