/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { isDue } from '@/lib/reports/digest';
import { verifyChallenge, normalizeState, intasendBaseUrl } from '@/lib/intasend/client';

describe('digest scheduling', () => {
  const mon7 = new Date('2026-10-12T07:10:00Z'); // Monday 07:10 UTC
  const s = { cadence: 'weekly' as const, weekday: 1, month_day: null, hour_utc: 7, last_run_at: null, enabled: true };
  it('is due on the configured weekday + hour, once', () => {
    expect(isDue(s, mon7)).toBe(true);
    expect(isDue({ ...s, last_run_at: '2026-10-12T07:01:00Z' }, mon7)).toBe(false);
    expect(isDue({ ...s, enabled: false }, mon7)).toBe(false);
    expect(isDue({ ...s, hour_utc: 8 }, mon7)).toBe(false);
    expect(isDue({ ...s, cadence: 'monthly', month_day: 12 }, mon7)).toBe(true);
  });
});

describe('IntaSend helpers', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('reads env at call time (no frozen module-level config)', () => {
    process.env.INTASEND_TEST_MODE = 'false';
    delete process.env.INTASEND_BASE_URL;
    expect(intasendBaseUrl()).toBe('https://payment.intasend.com');
    process.env.INTASEND_TEST_MODE = 'true';
    expect(intasendBaseUrl()).toBe('https://sandbox.intasend.com');
  });
  it('verifies the webhook challenge in constant time and rejects missing config', () => {
    process.env.INTASEND_WEBHOOK_CHALLENGE = 'abc123';
    expect(verifyChallenge('abc123')).toBe(true);
    expect(verifyChallenge('abc124')).toBe(false);
    expect(verifyChallenge('abc')).toBe(false);
    expect(verifyChallenge(undefined)).toBe(false);
    delete process.env.INTASEND_WEBHOOK_CHALLENGE;
    expect(verifyChallenge('abc123')).toBe(false);
  });
  it('normalises states', () => {
    expect(normalizeState('complete')).toBe('COMPLETE');
    expect(normalizeState('weird')).toBeNull();
  });
});
