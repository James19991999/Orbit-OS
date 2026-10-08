/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { chain } from './chain';

const from = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from }), hasServiceRole: () => true }));
const sendEmail = jest.fn(() => Promise.resolve({ sent: true }));
jest.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])), emailLayout: () => '<p/>' }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/renewals/route';

const today = new Date(); today.setUTCHours(12, 0, 0, 0);
const org = { id: 'o1', name: 'Acme', plan: 'pro', status: 'active', quiet_hours: false, seat_autoscale: false, seat_limit: 50,
  plan_expires_at: new Date(today.getTime() + 3 * 86_400_000).toISOString() };
const owner = { user_id: 'u1', profile: { email: 'o@x.io', full_name: 'O', timezone: 'UTC', work_start: '00:00', work_end: '23:59' } };
const call = () => GET(new NextRequest('http://x/api/cron/renewals', { headers: { authorization: 'Bearer s' } }), undefined as never);

function setup(notifInsertError: unknown, already = 0) {
  from.mockImplementation((table: string) => {
    if (table === 'organizations') return chain({ data: [org], error: null });
    if (table === 'memberships') return chain({ data: [owner], error: null });
    const c = chain({ count: already, error: null }) as Record<string, jest.Mock>;
    c.insert = jest.fn(() => chain({ error: notifInsertError }));
    return c;
  });
}
beforeEach(() => { process.env.CRON_SECRET = 's'; sendEmail.mockClear(); });

describe('renewal reminders cron', () => {
  it('emails an owner 3 days before expiry', async () => {
    setup(null);
    const body = await (await call()).json();
    expect(body.reminders).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('does NOT email when the dedupe marker (notification) cannot be written — no hourly spam', async () => {
    setup({ message: 'insert failed' });
    const body = await (await call()).json();
    expect(body.reminders).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('sends at most once per day', async () => {
    setup(null, 1);
    await call();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
