'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Dialog, Icon } from '@/components/ui';
import { TaskDialog, type PersonOption } from './TaskDialog';
import { SprintDialog } from './SprintDialog';
import { FinanceEntryDialog, PayrollDialog, InvoiceDialog } from './FinanceDialogs';
import type { Sprint } from '@/lib/types';
import type { Currency } from '@/lib/format';
import { useT } from '@/i18n/client';

type Which = null | 'task' | 'sprint' | 'finance' | 'payroll' | 'invoice' | 'chooser';

export function OpsActions({ orgId, userId, people, sprints, activeSprintId, currency, thresholdMinor, invoiceNumbers, canManage, canWrite, show }:
  { orgId: string; userId: string; people: PersonOption[]; sprints: Pick<Sprint, 'id' | 'name'>[]; activeSprintId: string | null; currency: Currency;
    thresholdMinor: number; invoiceNumbers: string[]; canManage: boolean; canWrite: boolean; show: ('task' | 'sprint' | 'finance' | 'payroll' | 'invoice')[] }) {
  const t = useT();
  const sp = useSearchParams();
  const [open, setOpen] = useState<Which>(null);
  const [financeKind, setFinanceKind] = useState('expense');
  useEffect(() => {
    const n = sp.get('new');
    if (n === 'expense' && canManage) { setFinanceKind('expense'); setOpen('finance'); }
    if (n === 'task' && canWrite) setOpen('task');
    if (n === 'invoice' && canManage) setOpen('invoice');
  }, [sp, canManage, canWrite]);
  if (!canWrite) return null;
  const close = () => setOpen(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {show.includes('task') && <Button icon="add_task" variant="secondary" size="sm" onClick={() => setOpen('task')}>{t('ops.new_task')}</Button>}
        {show.includes('sprint') && canManage && <Button icon="date_range" variant="secondary" size="sm" onClick={() => setOpen('sprint')}>{t('ops.plan_sprint')}</Button>}
        {show.includes('finance') && canManage && <Button icon="receipt_long" variant="secondary" size="sm" onClick={() => { setFinanceKind('expense'); setOpen('finance'); }}>{t('ops.log_entry')}</Button>}
        {show.includes('payroll') && canManage && <Button icon="payments" variant="secondary" size="sm" onClick={() => setOpen('payroll')}>{t('ops.record_payroll')}</Button>}
        {show.includes('invoice') && canManage && <Button icon="request_quote" size="sm" onClick={() => setOpen('invoice')}>{t('ops.issue_invoice')}</Button>}
      </div>
      {/* Floating action (mobile) — "Create Task or Issue Invoice" from the design */}
      <button type="button" onClick={() => setOpen(canManage ? 'chooser' : 'task')} aria-label={canManage ? t('ops.fab') : t('ops.fab_task')}
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-white shadow-glow lg:hidden">
        <Icon name="add" className="text-[28px]" />
      </button>
      <Dialog open={open === 'chooser'} onClose={close} title={t('ops.create')}>
        <div className="grid gap-2">
          <Button variant="secondary" icon="add_task" onClick={() => setOpen('task')}>{t('ops.create_task')}</Button>
          <Button variant="secondary" icon="request_quote" onClick={() => setOpen('invoice')}>{t('ops.issue_invoice')}</Button>
          <Button variant="secondary" icon="receipt_long" onClick={() => setOpen('finance')}>{t('ops.log_spend')}</Button>
        </div>
      </Dialog>
      <TaskDialog open={open === 'task'} onClose={close} orgId={orgId} userId={userId} people={people} sprints={sprints} defaultSprintId={activeSprintId} />
      <SprintDialog open={open === 'sprint'} onClose={close} orgId={orgId} />
      <FinanceEntryDialog open={open === 'finance'} onClose={close} orgId={orgId} currency={currency} thresholdMinor={thresholdMinor} defaultKind={financeKind} />
      <PayrollDialog open={open === 'payroll'} onClose={close} orgId={orgId} currency={currency} />
      <InvoiceDialog open={open === 'invoice'} onClose={close} orgId={orgId} currency={currency} existingNumbers={invoiceNumbers} />
    </>
  );
}
