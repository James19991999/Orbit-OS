import { guardApiRequest, likeExact, MAX_API_BODY_BYTES } from '@/lib/security/request-guard';

const base = { method: 'POST', pathname: '/api/tasks', host: 'app.orbitos.io', origin: 'https://app.orbitos.io', secFetchSite: 'same-origin', contentLength: '120' };

describe('guardApiRequest', () => {
  it('allows same-site writes', () => expect(guardApiRequest(base)).toEqual({ ok: true }));
  it('blocks writes from another website', () => {
    expect(guardApiRequest({ ...base, origin: 'https://evil.example' })).toMatchObject({ ok: false, status: 403 });
    expect(guardApiRequest({ ...base, origin: 'https://app.orbitos.io.evil.example' })).toMatchObject({ ok: false, status: 403 });
  });
  it('blocks opaque origins and browser-flagged cross-site writes', () => {
    expect(guardApiRequest({ ...base, origin: 'null' })).toMatchObject({ ok: false, status: 403 });
    expect(guardApiRequest({ ...base, origin: null, secFetchSite: 'cross-site' })).toMatchObject({ ok: false, status: 403 });
  });
  it('allows the configured app address and non-browser clients', () => {
    expect(guardApiRequest({ ...base, host: 'orbit-xyz.vercel.app', origin: 'https://app.orbitos.io', appUrl: 'https://app.orbitos.io' })).toEqual({ ok: true });
    expect(guardApiRequest({ ...base, origin: null, secFetchSite: null })).toEqual({ ok: true });
  });
  it('never blocks reads, and ignores non-API paths', () => {
    expect(guardApiRequest({ ...base, method: 'GET', origin: 'https://evil.example' })).toEqual({ ok: true });
    expect(guardApiRequest({ ...base, pathname: '/dashboard', origin: 'https://evil.example' })).toEqual({ ok: true });
  });
  it('refuses oversized bodies', () => {
    expect(guardApiRequest({ ...base, contentLength: String(MAX_API_BODY_BYTES + 1) })).toMatchObject({ ok: false, status: 413 });
  });
});

describe('likeExact', () => {
  it('neutralises ILIKE wildcards', () => {
    expect(likeExact('j_mes%@x.com')).toBe('j\\_mes\\%@x.com');
    expect(likeExact('a\\b')).toBe('a\\\\b');
    expect(likeExact('james@gmail.com')).toBe('james@gmail.com');
  });
});
