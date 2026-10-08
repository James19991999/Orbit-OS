/** @jest-environment node */
jest.mock('server-only', () => ({}));
const rpc = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc }), hasServiceRole: () => true }));
const paymentStatus = jest.fn();
jest.mock('@/lib/intasend/client', () => ({ ...jest.requireActual('@/lib/intasend/client'), paymentStatus: (...a: unknown[]) => paymentStatus(...a), isIntaSendConfigured: () => true }));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/webhooks/intasend/route';

const call = (body: unknown, ip = '1.1.1.1') => POST(new NextRequest('http://localhost/api/webhooks/intasend', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } }), undefined as never);

beforeEach(() => { process.env.INTASEND_WEBHOOK_CHALLENGE = 'top-secret'; rpc.mockReset(); paymentStatus.mockReset(); });

describe('IntaSend webhook', () => {
  it('rejects a missing or wrong challenge with 401 and touches nothing', async () => {
    expect((await call({ challenge: 'wrong', api_ref: 'orb_a', invoice_id: 'I1' })).status).toBe(401);
    expect((await call({ api_ref: 'orb_a', invoice_id: 'I1' })).status).toBe(401);
    expect(paymentStatus).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('trusts the re-fetched IntaSend state, NOT the payload state', async () => {
    paymentStatus.mockResolvedValue({ invoice: { invoice_id: 'I1', state: 'FAILED', api_ref: 'orb_a' } });
    rpc.mockResolvedValue({ data: 'failed', error: null });
    const res = await call({ challenge: 'top-secret', api_ref: 'orb_a', invoice_id: 'I1', state: 'COMPLETE' });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('apply_intasend_payment', expect.objectContaining({ p_api_ref: 'orb_a', p_state: 'FAILED' }));
  });
  it('routes invoice payments to apply_invoice_payment only when COMPLETE', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    paymentStatus.mockResolvedValue({ invoice: { invoice_id: 'I2', state: 'COMPLETE', api_ref: `inv_${id}` } });
    rpc.mockResolvedValue({ data: 'applied', error: null });
    const res = await call({ challenge: 'top-secret', api_ref: `inv_${id}`, invoice_id: 'I2' });
    expect(await res.json()).toEqual({ ok: true, result: 'applied' });
    expect(rpc).toHaveBeenCalledWith('apply_invoice_payment', expect.objectContaining({ p_invoice: id }));
  });
  it('rejects an api_ref that does not match what IntaSend reports (forgery)', async () => {
    paymentStatus.mockResolvedValue({ invoice: { invoice_id: 'I3', state: 'COMPLETE', api_ref: 'orb_real' } });
    expect((await call({ challenge: 'top-secret', api_ref: 'orb_forged', invoice_id: 'I3' })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('returns 502 (so IntaSend retries) when the status cannot be verified', async () => {
    paymentStatus.mockRejectedValue(new Error('down'));
    expect((await call({ challenge: 'top-secret', api_ref: 'orb_a', invoice_id: 'I4' })).status).toBe(502);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rate-limits by IP', async () => {
    let last = 200;
    for (let i = 0; i < 125; i++) last = (await call({ challenge: 'x' }, '9.9.9.9')).status;
    expect(last).toBe(429);
  });
});
