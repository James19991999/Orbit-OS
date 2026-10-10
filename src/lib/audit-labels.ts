/** Human-readable labels for audit actions (security log + audit log page). */
const LABELS: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.login_failed': 'Failed sign-in attempt', 'org.created': 'Workspace created', 'org.switched': 'Switched workspace',
  'org.settings_updated': 'Workspace settings changed', 'org.auth_settings_updated': 'Authentication policy changed', 'org.suspension_scheduled': 'Offboarding scheduled',
  'org.suspension_cancelled': 'Offboarding cancelled', 'member.added': 'Member added', 'member.role_changed': 'Member role changed', 'member.removed': 'Member removed',
  'member.active': 'Member reactivated', 'member.invited': 'Invite sent', 'member.invite_revoked': 'Invite revoked',
  'billing.checkout_started': 'Checkout started', 'billing.payment_applied': 'Payment applied', 'billing.payment_failed': 'Payment failed',
  'export.audit_package': 'Audit package downloaded', 'export.report': 'Report exported', 'export.tenant_archive': 'Tenant archive requested',
  'compliance.training_reminders': 'Training reminders sent', 'invoice.sent': 'Invoice sent', 'invoice.marked_paid': 'Invoice marked paid',
  'meeting.invites_sent': 'Meeting invites sent', 'integration.updated': 'Integration changed', 'report.dispatched': 'Report dispatched',
  'export.audit_log': 'Audit log exported', 'meeting.rescheduled': 'Meeting rescheduled',
  'payout.drafted': 'M-Pesa payout drafted', 'payout.approved': 'M-Pesa payout approved and sent', 'payout.cancelled': 'M-Pesa payout cancelled',
  'profile.whatsapp_linked': 'WhatsApp number linked', 'profile.whatsapp_unlinked': 'WhatsApp number unlinked',
  'finance_entries.approval_status_changed': 'Expense approved or rejected', 'invoices.status_changed': 'Invoice status changed',
  'tasks.status_changed': 'Task status changed', 'compliance_controls.status_changed': 'Control status changed',
};

const TARGETS: Record<string, string> = {
  user: 'Person', membership: 'Member', organization: 'Workspace', invite: 'Invite', billing_payment: 'Plan payment', report: 'Report',
  invoice: 'Invoice', invoices: 'Invoice', finance_entries: 'Expense', payout_batch: 'M-Pesa payout', tasks: 'Task', compliance_controls: 'Control',
  meeting: 'Meeting', integration: 'Integration',
};
/** Friendly name for an audit target type ("finance_entries" → "Expense"). */
export function auditTargetLabel(type: string | null): string {
  if (!type) return '';
  return TARGETS[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function auditLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const m = action.match(/^(\w+)\.(\w+)_changed$/);
  if (m) return `${m[1].replace(/_/g, ' ')} ${m[2].replace(/_/g, ' ')} changed`;
  return action.replace(/[._]/g, ' ');
}

export function isSecurityRelevant(action: string): boolean {
  return /^(auth|member|org|billing|export)\./.test(action);
}
