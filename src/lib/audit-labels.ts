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
};

export function auditLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const m = action.match(/^(\w+)\.(\w+)_changed$/);
  if (m) return `${m[1].replace(/_/g, ' ')} ${m[2].replace(/_/g, ' ')} changed`;
  return action.replace(/[._]/g, ' ');
}

export function isSecurityRelevant(action: string): boolean {
  return /^(auth|member|org|billing|export)\./.test(action);
}
