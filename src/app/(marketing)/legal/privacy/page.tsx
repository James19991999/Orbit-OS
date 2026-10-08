import type { Metadata } from 'next';
import { Prose } from '@/components/marketing/Prose';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  return (
    <Prose title="Privacy Policy" updated="8 October 2026">
      <p>This policy explains what OrbitOS collects, why, and the choices you have. It is a template written for this product; have it reviewed by counsel for your jurisdiction (including Kenya&apos;s Data Protection Act, 2019 and the GDPR where applicable) before relying on it.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: name, work email, time zone, working hours, profile photo.</li>
        <li>Workspace content you add: tasks, finance entries, meetings, messages, polls, kudos, compliance records and uploaded evidence.</li>
        <li>Security data: sign-in events, IP address and browser user agent, recorded in your workspace&apos;s audit log.</li>
        <li>Payment data: plan, amount and status. Card and M-Pesa details are handled by IntaSend; we never see full card numbers or your M-Pesa PIN.</li>
      </ul>
      <h2>How we use it</h2>
      <ul><li>To run the service and compute the metrics you see.</li><li>To send the emails you enable (invites, reminders, digests, receipts).</li><li>To keep accounts secure and investigate abuse.</li></ul>
      <h2>Who can see it</h2>
      <p>Workspace data is isolated per organization by database row-level security and is visible only to members according to their role. Individual poll votes marked anonymous are never shown to anyone, including admins.</p>
      <h2>Processors</h2>
      <ul><li>Supabase (database, authentication, storage)</li><li>Vercel (hosting)</li><li>IntaSend (payments)</li><li>Resend (email)</li></ul>
      <h2>Your rights</h2>
      <p>You can access, correct, export or delete your data. Workspace owners can download a full archive and schedule deletion from Settings. Contact your workspace owner or us for requests.</p>
      <h2>Retention</h2>
      <p>Workspace data is kept while the workspace is active. Offboarded workspaces are deleted 30 days after offboarding is confirmed. Audit logs follow the retention period the owner sets (default 7 years).</p>
    </Prose>
  );
}
