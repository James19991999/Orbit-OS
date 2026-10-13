// Why a customer is flagged in the Founder Console and the weekly founder email.
export type RiskReason = 'payment_failed' | 'lapsed' | 'quiet' | 'no_team';
export const RISK_LABEL: Record<RiskReason, string> = {
  payment_failed: 'Payment failed', lapsed: 'Plan ran out (read-only)', quiet: 'Nobody active for 7+ days', no_team: 'Trial with no teammates yet',
};
