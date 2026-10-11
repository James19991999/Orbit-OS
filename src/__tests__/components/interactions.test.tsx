import { WithEnglish } from '../i18n-wrapper';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

const refresh = jest.fn(); const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh, push: jest.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/culture' }));
const sb = {
  from: jest.fn(),
  auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'me' } } })), signOut: jest.fn() },
  rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn(() => Promise.resolve()),
};
jest.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => sb, requireBrowserClient: () => sb, setRememberDevice: jest.fn() }));

import { ToastProvider, Switch, Dialog } from '@/components/ui';
import { PollCard } from '@/components/culture/Poll';
import { RollCall } from '@/components/culture/RollCall';
import { useClipboard } from '@/hooks/useClipboard';
import { AppShell } from '@/components/shell/AppShell';

function q(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'order', 'limit', 'in']) c[m] = jest.fn(() => c);
  c.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
  c.single = () => Promise.resolve(result);
  return c;
}
const wrap = (ui: React.ReactElement) => render(<WithEnglish><ToastProvider>{ui}</ToastProvider></WithEnglish>);
beforeEach(() => { jest.clearAllMocks(); sb.channel.mockReturnValue({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }); });

describe('PollCard', () => {
  const poll = { id: 'p', question: 'How was the week?', anonymous: true, closes_at: null, kind: 'pulse' as const, created_at: '' };
  const options = [{ id: 'a', poll_id: 'p', label: 'Smooth', position: 0 }, { id: 'b', poll_id: 'p', label: 'Rough', position: 1 }];
  it('votes optimistically', async () => {
    sb.from.mockReturnValue(q({ error: null }));
    wrap(<PollCard poll={poll} options={options} results={{ a: 1, b: 1 }} myVote={null} orgId="o" canVote />);
    await userEvent.click(screen.getByRole('button', { name: /Smooth/ }));
    expect(screen.getByRole('button', { name: /Smooth/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Smooth/ })).toHaveTextContent('67%');
  });
  it('rolls back and shows an error when the vote fails', async () => {
    sb.from.mockReturnValue(q({ error: { message: 'new row violates row-level security policy' } }));
    wrap(<PollCard poll={poll} options={options} results={{ a: 1, b: 1 }} myVote={null} orgId="o" canVote />);
    await userEvent.click(screen.getByRole('button', { name: /Smooth/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Vote not saved: You don't have permission/);
    expect(screen.getByRole('button', { name: /Smooth/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Smooth/ })).toHaveTextContent('50%');
  });
});

describe('RollCall', () => {
  it('validates before saving, then upserts today’s check-in', async () => {
    const chain = q({ data: [{ id: 'c' }], error: null });
    sb.from.mockReturnValue(chain);
    wrap(<RollCall orgId="o" userId="me" completed={3} total={10} mine={null} canWrite today="2026-10-08" />);
    expect(screen.getByText(/30%/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    expect(await screen.findByText(/Share at least one thing/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What did you ship today?'), 'Shipped tests');
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ shipped: 'Shipped tests', for_date: '2026-10-08', mood: 4 }), { onConflict: 'org_id,user_id,for_date' }));
  });
});

describe('UI primitives', () => {
  it('Switch is a real switch with aria-checked', async () => {
    const onChange = jest.fn();
    render(<Switch label="Quiet hours" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Quiet hours' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('Dialog is labelled and accessible', async () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const { container } = render(<Dialog open onClose={() => undefined} title="Create task"><p>Body</p></Dialog>);
    expect(screen.getByRole('dialog', { name: 'Create task' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
  it('useClipboard reports failure instead of swallowing it', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.reject(new Error('denied'))) } });
    function C() { const c = useClipboard(); return <button type="button" onClick={() => c.copy('x')}>{c.status}</button>; }
    render(<C />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('error'));
  });
});

describe('AppShell sign-out', () => {
  it('shows an error and re-enables when sign-out fails (never hangs on "Signing out…")', async () => {
    sb.auth.signOut.mockResolvedValue({ error: { message: 'network down' } });
    sb.from.mockReturnValue(q({ data: [], count: 0, error: null }));
    wrap(
      <AppShell user={{ id: 'me', name: 'Elena Kamau', email: 'e@x.io', avatar: null, theme: 'dark', timezone: 'Africa/Nairobi' }}
        org={{ name: 'Acme', slug: 'acme', plan: 'pro', expiresAt: new Date(Date.now() + 1e9).toISOString(), readOnly: false, timeoutHours: 8, status: 'active', autoDetectTz: false }}
        role="owner" workspaces={[{ name: 'Acme', slug: 'acme', role: 'owner' }]}><p>content</p></AppShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText(/Sign-out failed: network down/)).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });
});
