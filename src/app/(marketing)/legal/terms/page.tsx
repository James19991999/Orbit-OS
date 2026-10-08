import type { Metadata } from 'next';
import { Prose } from '@/components/marketing/Prose';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Terms() {
  return (
    <Prose title="Terms of Service" updated="8 October 2026">
      <p>These template terms govern use of OrbitOS. Have them reviewed by counsel before publishing.</p>
      <h2>Accounts</h2>
      <p>You are responsible for activity under your account and for keeping credentials secure. Workspace owners control membership and roles.</p>
      <h2>Plans and payment</h2>
      <p>Plans are paid in advance for one month or one year through IntaSend (M-Pesa or card). Payments do not renew automatically. After the paid period and a 3-day grace period, the workspace becomes read-only until renewed. Fees are non-refundable except where required by law.</p>
      <h2>Acceptable use</h2>
      <p>Don&apos;t use OrbitOS to break the law, infringe rights, send spam, or attempt to access another workspace&apos;s data.</p>
      <h2>Compliance features</h2>
      <p>OrbitOS helps you track compliance work. It does not certify compliance with SOC 2, GDPR, ISO 27001, HIPAA or any other standard; only qualified auditors can.</p>
      <h2>Your data</h2>
      <p>You own your workspace content. You can export it at any time and delete it by offboarding the workspace.</p>
      <h2>Liability</h2>
      <p>The service is provided “as is”. To the extent permitted by law, our liability is limited to the fees you paid in the 12 months before the claim.</p>
    </Prose>
  );
}
