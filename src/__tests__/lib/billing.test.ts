import { priceFor, seatsFor, PLANS, planAllows } from '@/lib/billing/plans';
import { normalizeKePhone } from '@/lib/intasend/phone';

describe('plans', () => {
  it('prices plans per period and currency', () => {
    expect(priceFor('pro', 'monthly', 'KES')).toBe(PLANS.pro.monthly.KES);
    expect(priceFor('pro', 'annual', 'USD')).toBe(PLANS.pro.annual.USD);
  });
  it('annual is cheaper than 12 monthly payments', () => {
    for (const p of Object.values(PLANS)) expect(p.annual.KES).toBeLessThan(p.monthly.KES * 12);
  });
  it('adds seat blocks only on enterprise', () => {
    expect(priceFor('enterprise', 'monthly', 'KES', 2)).toBe(PLANS.enterprise.monthly.KES + 2 * 250_000);
    expect(priceFor('pro', 'monthly', 'KES', 2)).toBe(PLANS.pro.monthly.KES);
    expect(seatsFor('enterprise', 3)).toBe(230);
    expect(seatsFor('starter', 3)).toBe(10);
    expect(priceFor('enterprise', 'monthly', 'KES', -5)).toBe(PLANS.enterprise.monthly.KES);
  });
  it('gates features by plan', () => {
    expect(planAllows('starter', 'auditPackage')).toBe(false);
    expect(planAllows('enterprise', 'auditPackage')).toBe(true);
    expect(planAllows('pro', 'sso')).toBe(true);
    expect(planAllows('starter', 'sso')).toBe(false);
  });
});

describe('normalizeKePhone', () => {
  it.each([
    ['0712345678', '254712345678'], ['+254 712 345 678', '254712345678'], ['254112345678', '254112345678'],
    ['0112-345-678', '254112345678'], ['712345678', '254712345678'],
  ])('%s → %s', (input, out) => expect(normalizeKePhone(input)).toBe(out));
  it.each(['0812345678', '12345', '07123456789', 'abc'])('rejects %s', (input) => expect(normalizeKePhone(input)).toBeNull());
});
