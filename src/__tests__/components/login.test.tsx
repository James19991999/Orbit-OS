import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

const replace = jest.fn(); const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh, push: jest.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/login' }));
const auth = { signInWithPassword: jest.fn(), signInWithOAuth: jest.fn(), signInWithSSO: jest.fn() };
const rpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({ auth, rpc }), setRememberDevice: jest.fn() }));
jest.mock('@simplewebauthn/browser', () => ({ startAuthentication: jest.fn() }));

import { WithEnglish } from '../i18n-wrapper';
import { LoginForm } from '@/components/auth/LoginForm';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })) as never;
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe('LoginForm', () => {
  it('signs in with email + password and redirects to a safe next path', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    render(<WithEnglish><LoginForm next="/reports" /></WithEnglish>);
    await userEvent.type(screen.getByLabelText('Work email'), 'elena@acme.io');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'pw-123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/reports'));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'elena@acme.io', password: 'pw-123456789' });
  });
  it('shows a friendly error and logs the failed attempt', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<WithEnglish><LoginForm /></WithEnglish>);
    await userEvent.type(screen.getByLabelText('Work email'), 'x@y.io');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect((global.fetch as jest.Mock).mock.calls.some(([u, o]) => u === '/api/auth/event' && String(o?.body).includes('login_failed'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
  it('never redirects off-site', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    render(<WithEnglish><LoginForm next="//evil.com" /></WithEnglish>);
    await userEvent.type(screen.getByLabelText('Work email'), 'a@b.io');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
  it('starts Google and Azure OAuth with the right providers', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    const first = render(<WithEnglish><LoginForm /></WithEnglish>);
    await userEvent.click(screen.getByRole('button', { name: /Google Workspace/ }));
    expect(auth.signInWithOAuth).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'google' }));
    // while the browser redirects, every sign-in button stays disabled (no double submits)
    expect(screen.getByRole('button', { name: /Entra ID/ })).toBeDisabled();
    first.unmount();
    render(<WithEnglish><LoginForm /></WithEnglish>);
    await userEvent.click(screen.getByRole('button', { name: /Entra ID/ }));
    expect(auth.signInWithOAuth).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'azure', options: expect.objectContaining({ scopes: 'email' }) }));
  });
  it('enables SAML SSO only for a workspace with an SSO domain', async () => {
    rpc.mockResolvedValue({ data: [{ name: 'Acme', slug: 'acme', sso_domain: 'acme.io' }], error: null });
    auth.signInWithSSO.mockResolvedValue({ data: { url: 'https://idp.example/sso' }, error: null });
    render(<WithEnglish><LoginForm /></WithEnglish>);
    expect(screen.getByRole('button', { name: /Okta/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Workspace subdomain'), 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Okta/ })).toBeEnabled());
    const assign = jest.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, origin: 'http://localhost', set href(v: string) { assign(v); } }, writable: true });
    await userEvent.click(screen.getByRole('button', { name: /Okta/ }));
    await waitFor(() => expect(auth.signInWithSSO).toHaveBeenCalledWith(expect.objectContaining({ domain: 'acme.io' })));
  });
  it('requires an email before a passkey sign-in', async () => {
    render(<WithEnglish><LoginForm /></WithEnglish>);
    await userEvent.click(screen.getByRole('button', { name: /passkey/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter your work email first/);
  });
  it('has no axe violations', async () => {
    const { container } = render(<WithEnglish><LoginForm /></WithEnglish>);
    await screen.findByText(/Checking status|All systems operational/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
