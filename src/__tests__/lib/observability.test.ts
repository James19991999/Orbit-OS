import type { ErrorEvent } from '@sentry/nextjs';

const captureException = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  withScope: (fn: (s: { setTag: jest.Mock }) => void) => fn({ setTag: jest.fn() }),
  setUser: jest.fn(),
  setTag: jest.fn(),
}));

describe('scrubEvent', () => {
  it('removes cookies, auth headers, request bodies, one-time tokens and user emails', async () => {
    const { scrubEvent } = await import('@/lib/observability/sentry-options');
    const ev = {
      type: undefined,
      request: {
        url: 'https://app.example.com/auth/callback?code=abc123&next=%2Fdashboard&token_hash=zzz',
        query_string: 'code=abc123&next=%2Fdashboard',
        cookies: { 'sb-access-token': 'secret' },
        headers: { Cookie: 'sb=secret', Authorization: 'Bearer x', 'user-agent': 'UA' },
        data: { password: 'hunter2' },
      },
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev)!;
    expect(out.request!.cookies).toBeUndefined();
    expect(out.request!.headers).toEqual({ 'user-agent': 'UA' });
    expect(out.request!.data).toBeUndefined();
    expect(out.request!.url).toBe('https://app.example.com/auth/callback?code=[redacted]&next=%2Fdashboard&token_hash=[redacted]');
    expect(out.request!.query_string).toBe('code=[redacted]&next=%2Fdashboard');
    expect(out.user).toEqual({ id: 'u1' });
  });
});

describe('reportError', () => {
  const OLD = process.env.NEXT_PUBLIC_SENTRY_DSN;
  afterEach(() => { process.env.NEXT_PUBLIC_SENTRY_DSN = OLD; jest.resetModules(); captureException.mockClear(); });

  it('is a no-op when no DSN is configured', async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const { reportError } = await import('@/lib/observability/report');
    reportError(new Error('boom'), { route: '/api/x' });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures when a DSN is configured', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@o1.ingest.sentry.io/1';
    const { reportError } = await import('@/lib/observability/report');
    const err = new Error('boom');
    reportError(err, { route: '/api/x', method: 'POST' });
    expect(captureException).toHaveBeenCalledWith(err);
  });
});
