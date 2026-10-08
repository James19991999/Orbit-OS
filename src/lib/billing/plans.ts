import type { Currency } from '@/lib/format';

export type PlanId = 'starter' | 'pro' | 'enterprise';
export type BillingPeriod = 'monthly' | 'annual';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  includedSeats: number;
  monthly: Record<Currency, number>; // minor units
  annual: Record<Currency, number>;  // minor units (2 months free)
  features: string[];
  limits: { frameworks: number; sso: 'none' | 'oauth' | 'saml'; auditPackage: boolean; scheduledDigests: boolean; tenantArchive: boolean };
}

/** Single source of truth for pricing. Edit amounts here (minor units: KES cents / US cents). */
export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter', name: 'Starter', tagline: 'For small remote teams getting organised',
    includedSeats: 10,
    monthly: { KES: 490_000, USD: 3_900 },
    annual: { KES: 4_900_000, USD: 39_000 },
    features: ['Up to 10 seats', 'Dashboard, operations & scheduling', 'Culture lounge, channels & kudos', '1 compliance framework', 'Email + password sign-in'],
    limits: { frameworks: 1, sso: 'none', auditPackage: false, scheduledDigests: false, tenantArchive: false },
  },
  pro: {
    id: 'pro', name: 'Pro', tagline: 'For distributed companies scaling across time zones',
    includedSeats: 50,
    monthly: { KES: 1_490_000, USD: 11_900 },
    annual: { KES: 14_900_000, USD: 119_000 },
    features: ['Up to 50 seats', 'Everything in Starter', 'Google Workspace & Azure AD sign-in', '3 compliance frameworks', 'Scheduled report digests'],
    limits: { frameworks: 3, sso: 'oauth', auditPackage: false, scheduledDigests: true, tenantArchive: false },
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise', tagline: 'For regulated, multi-entity organisations',
    includedSeats: 200,
    monthly: { KES: 3_990_000, USD: 31_900 },
    annual: { KES: 39_900_000, USD: 319_000 },
    features: ['200 seats + blocks of 10', 'Everything in Pro', 'SAML single sign-on (Okta)', 'All compliance frameworks', 'Audit-ready package & tenant archive'],
    limits: { frameworks: 99, sso: 'saml', auditPackage: true, scheduledDigests: true, tenantArchive: true },
  },
};

export const SEAT_BLOCK = { size: 10, monthly: { KES: 250_000, USD: 2_000 } as Record<Currency, number> };
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;

export function seatsFor(plan: PlanId, extraBlocks: number): number {
  return PLANS[plan].includedSeats + (plan === 'enterprise' ? Math.max(0, Math.floor(extraBlocks)) * SEAT_BLOCK.size : 0);
}

/** Server-side price calculation — never trust an amount sent by the client. */
export function priceFor(plan: PlanId, period: BillingPeriod, currency: Currency, extraBlocks = 0): number {
  const p = PLANS[plan];
  if (!p) throw new Error('Unknown plan');
  const base = period === 'annual' ? p.annual[currency] : p.monthly[currency];
  const blocks = plan === 'enterprise' ? Math.max(0, Math.floor(extraBlocks)) : 0;
  const blockPrice = SEAT_BLOCK.monthly[currency] * (period === 'annual' ? 10 : 1);
  return base + blocks * blockPrice;
}

export function isPlanId(v: unknown): v is PlanId {
  return v === 'starter' || v === 'pro' || v === 'enterprise';
}

export function planAllows(plan: PlanId, feature: keyof Plan['limits']): boolean {
  const v = PLANS[plan].limits[feature];
  return typeof v === 'boolean' ? v : typeof v === 'number' ? v > 0 : v !== 'none';
}
