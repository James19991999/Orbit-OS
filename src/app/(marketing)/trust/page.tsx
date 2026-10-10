import type { Metadata } from 'next';
import { Prose } from '@/components/marketing/Prose';

export const metadata: Metadata = { title: 'Trust Center' };

export default function Trust() {
  return (
    <Prose title="Trust Center">
      <p>How OrbitOS protects your workspace. We describe controls we actually run — we don&apos;t claim certifications we don&apos;t hold.</p>
      <h2>Tenant isolation</h2>
      <p>Every table is protected by Postgres row-level security keyed to workspace membership and role. Billing records, audit logs and plan fields have no client write path at all. These policies ship with an automated test suite that exercises cross-tenant reads and writes, role escalation and expired-workspace behavior.</p>
      <h2>Authentication</h2>
      <ul><li>Email and password, Google Workspace, Microsoft Entra ID, and SAML SSO (Enterprise).</li><li>Passkeys (WebAuthn) and authenticator-app two-factor; owners can require two-factor for owners and directors.</li><li>Configurable inactivity timeout.</li></ul>
      <h2>Auditability</h2>
      <p>Sign-ins, failed sign-ins, role changes, exports and billing events are written to an append-only audit log your auditors can read and export.</p>
      <h2>Payments</h2>
      <p>Payments run through IntaSend. Webhooks are verified and every payment status is re-confirmed with IntaSend before it changes your plan.</p>
      <h2>Your data, your exit</h2>
      <p>Owners can schedule deletion of their workspace at any time. On Enterprise they can also download a full archive first.</p>
    </Prose>
  );
}
