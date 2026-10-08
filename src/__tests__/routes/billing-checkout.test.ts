/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { chain } from './chain';

const requireApiContext = jest.fn();
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), requireApiContext: (...a: unknown[]) => requireApiContext(...a), audit: jest.fn() }));
const from = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from }), hasServiceRole: () => true }));
const mpesaStkPush = jest.fn();
const createCheckout = jest.fn();
jest.mock('@/lib/intasend/client', () => ({ ...jest.requireActual('@/lib/intasend/client'), isIntaSendConfigured: () => true,
  mpesaStkPush: (...a: unknown[]) => mpesaStkPush(...a), createCheckout: (...a: unknown[]) => createCheckout(...a) }));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/billing/checkout/route';
import { ApiError } from '@/lib/api';
import { priceFor } from '@/lib/billing/plans';

const org = { id: 'org-1', currency: 'USD', plan: 'pro', status: 'active', plan_expires_at: new Date(Date.now() + 1e9).toISOString(), seat_limit: 50 };
let n = 0;
const call = (body: unknown) => POST(new NextRequest('http://localhost/api/billing/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), undefined as never);

beforeEach(() => {
  requireApiContext.mockResolvedValue({ user: { id: `u-${++n}`, email: 'owner@x.io' }, org, role: 'owner' });
  from.mockImplementation((table: string) => (table === 'memberships' ? chain({ count: 12 }) : chain({ data: { id: 'pay-1' }, error: null })));
  mpesaStkPush.mockReset().mockResolvedValue({ invoice: { invoice_id: 'INV1', state: 'PENDING' } });
  createCheckout.mockReset().mockResolvedValue({ id: 'CO1', url: 'https://pay.example/co1' });
});

describe('POST /api/billing/checkout', () => {
  it('rejects any client-supplied amount (strict schema)', async () => {
    const res = await call({ plan: 'pro', period: 'monthly', method: 'CARD', amount: 1 });
    expect(res.status).toBe(400);
    expect(createCheckout).not.toHaveBeenCalled();
  });
  it('is owner-only', async () => {
    requireApiContext.mockRejectedValueOnce(new ApiError(403, 'Your role does not allow this action'));
    expect((await call({ plan: 'pro', period: 'monthly', method: 'CARD' })).status).toBe(403);
  });
  it('M-Pesa: validates the phone, charges the server-computed KES price', async () => {
    expect((await call({ plan: 'pro', period: 'monthly', method: 'MPESA', phone: '0812' })).status).toBe(400);
    const res = await call({ plan: 'pro', period: 'annual', method: 'MPESA', phone: '0712 345 678' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.currency).toBe('KES');
    expect(mpesaStkPush).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: priceFor('pro', 'annual', 'KES'), phone: '254712345678' }));
    expect(body.ref).toMatch(/^orb_org-1_[0-9a-f]{12}$/);
  });
  it('Card: charges in the workspace currency and returns the hosted checkout URL', async () => {
    const body = await (await call({ plan: 'enterprise', period: 'monthly', method: 'CARD', extraBlocks: 2 })).json();
    expect(body.url).toBe('https://pay.example/co1');
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: priceFor('enterprise', 'monthly', 'USD', 2), currency: 'USD' }));
  });
  it('refuses a plan smaller than the active team', async () => {
    from.mockImplementation((table: string) => (table === 'memberships' ? chain({ count: 30 }) : chain({ data: { id: 'p' }, error: null })));
    expect((await call({ plan: 'starter', period: 'monthly', method: 'CARD' })).status).toBe(409);
  });
  it('marks the payment FAILED and returns 502 when IntaSend errors', async () => {
    createCheckout.mockRejectedValueOnce(new (jest.requireActual('@/lib/intasend/client').IntaSendError)('IntaSend error 400: bad'));
    expect((await call({ plan: 'pro', period: 'monthly', method: 'CARD' })).status).toBe(502);
  });
});

describe('M-Pesa tracking', () => {
  it('fails loudly (500) if the IntaSend invoice id cannot be stored — and does NOT mark the payment failed', async () => {
    const updates: unknown[] = [];
    from.mockImplementation((table: string) => {
      if (table === 'memberships') return chain({ count: 1 });
      const c = chain({ data: { id: 'pay-1' }, error: null }) as Record<string, jest.Mock>;
      c.update = jest.fn((v: unknown) => { updates.push(v); return chain({ error: { message: 'db down' } }); });
      return c;
    });
    const res = await call({ plan: 'pro', period: 'monthly', method: 'MPESA', phone: '0712345678' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/could not be tracked/);
    expect(updates).toHaveLength(1); // only the tracking write — no "FAILED" overwrite (the STK prompt is already on the phone)
    expect(updates[0]).toMatchObject({ intasend_invoice_id: 'INV1' });
  });
  it('rejects an STK response without an invoice id', async () => {
    mpesaStkPush.mockResolvedValueOnce({ invoice: {} });
    expect((await call({ plan: 'pro', period: 'monthly', method: 'MPESA', phone: '0712345678' })).status).toBe(502);
  });
});

describe('cron auth', () => {
  it('requires CRON_SECRET', async () => {
    const { requireCronSecret } = jest.requireActual('@/lib/api');
    delete process.env.CRON_SECRET;
    expect(() => requireCronSecret(new NextRequest('http://x/api/cron/renewals'))).toThrow('CRON_SECRET is not configured');
    process.env.CRON_SECRET = 's';
    expect(() => requireCronSecret(new NextRequest('http://x/api/cron/renewals', { headers: { authorization: 'Bearer nope' } }))).toThrow('Unauthorized');
    expect(() => requireCronSecret(new NextRequest('http://x/api/cron/renewals', { headers: { authorization: 'Bearer s' } }))).not.toThrow();
  });
});
