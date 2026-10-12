'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, cn, Avatar, Dialog, Banner, useToast } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { TIMEOUT_COOKIE } from '@/lib/env';
import { errorMessage, postJson } from '@/hooks/useAction';
import { NAV, isActive } from './nav';
import { Logo } from './Logo';
import { NotificationsBell } from './NotificationsBell';
import { applyTheme, type ThemePref } from './theme';
import { TimezonePrompt } from './TimezonePrompt';
import { NetworkStatus } from './NetworkStatus';
import { NavProgress } from './NavProgress';
import { QuickActions } from './QuickActions';
import { ProductTour } from './ProductTour';
import { brandCss } from '@/lib/brand';
import type { Role } from '@/lib/types';
import { useFormat } from '@/lib/locale/client';
import { useT } from '@/i18n/client';

export interface ShellProps {
  user: { id: string; name: string; email: string; avatar: string | null; theme: ThemePref; timezone: string; founder?: boolean; tourDone?: boolean };
  org: { id: string; name: string; slug: string; plan: string; expiresAt: string; readOnly: boolean; timeoutHours: number; status: string; autoDetectTz: boolean; brandColor?: string | null; logoUrl?: string | null };
  role: Role;
  workspaces: { name: string; slug: string; role: Role }[];
  children: React.ReactNode;
}

export function AppShell({ user, org, role, workspaces, children }: ShellProps) {
  const fmt = useFormat();
  const t = useT();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const navItem = NAV.find((n) => isActive(pathname, n.href));
  const section = navItem ? t(navItem.labelKey)
    : t(pathname.startsWith('/profile') ? 'nav.profile' : pathname.startsWith('/notifications') ? 'nav.notifications' : 'nav.workspace');

  useSessionGuard(org.timeoutHours);
  useEffect(() => { applyTheme(user.theme); }, [user.theme]);
  // "I'm here" for the Founder Console's people-online count: at most every 2 minutes, only while the tab is visible.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      try { Promise.resolve(getBrowserClient()?.rpc('touch_activity', { p_org: org.id })).catch(() => undefined); } catch { /* best effort: never break the page */ }
    };
    beat();
    const iv = setInterval(beat, 120_000);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', beat); };
  }, [org.id]);
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      {org.brandColor && <style dangerouslySetInnerHTML={{ __html: brandCss(org.brandColor) }} />}
      <ProductTour userId={user.id} done={!!user.tourDone} />
      <aside data-tour="nav" className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-outline-variant bg-surface-container-lowest lg:flex" aria-label={t('nav.primary')}>
        <div className="flex h-16 items-center px-5">{org.logoUrl ? <OrgLogo url={org.logoUrl} name={org.name} /> : <Logo href="/dashboard" />}</div>
        <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={active ? 'page' : undefined}
                    className={cn('flex h-10 items-center gap-3 rounded px-3 text-label-md transition-colors',
                      active ? 'bg-primary-container/15 text-on-surface shadow-[inset_2px_0_0_rgb(var(--c-primary-container))]' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface')}>
                    <Icon name={n.icon} filled={active} className={active ? 'text-primary' : ''} />
                    {t(n.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-outline-variant p-4 text-body-sm text-on-surface-variant">
          <p className="text-label-xs uppercase">{t('shell.plan')}</p>
          <p className="mt-1 text-on-surface capitalize">{org.plan} · {org.readOnly ? t('shell.expired') : t('shell.until', { date: fmt.date(org.expiresAt) })}</p>
          {role === 'owner' && <Link href="/settings/billing" className="mt-1 inline-block text-primary underline-offset-2 hover:underline">{t('shell.manage_billing')}</Link>}
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-outline-variant bg-surface/85 px-4 backdrop-blur-xl lg:h-16 lg:px-8">
        <div className="lg:hidden">{org.logoUrl ? <OrgLogo url={org.logoUrl} name={org.name} compact /> : <Logo href="/dashboard" compact />}</div>
        <p className="min-w-0 truncate text-label-md text-on-surface-variant">
          <span className="hidden sm:inline">OrbitOS · </span><span className="text-on-surface">{section}</span>
        </p>
        <div className="ml-auto flex items-center gap-1">
          <QuickActions role={role} />
          <OrgSwitcher current={org} workspaces={workspaces} />
          <span data-tour="bell" className="flex"><NotificationsBell userId={user.id} /></span>
          <span data-tour="profile" className="flex"><ProfileMenu user={user} /></span>
        </div>
      </header>

      {(org.readOnly || org.status !== 'active') && (
        <div className="px-4 pt-4 lg:px-8">
          <Banner tone="warning">
            {org.status !== 'active'
              ? <>{t('shell.readonly_status', { status: org.status })}</>
              : <>{t('shell.readonly_expired')} {role === 'owner' ? <Link className="underline" href="/settings/billing">{t('shell.renew')}</Link> : t('shell.ask_owner')}</>}
          </Banner>
        </div>
      )}

      <Suspense fallback={null}><NavProgress /></Suspense>
      <NetworkStatus />
      {org.autoDetectTz && <TimezonePrompt userId={user.id} profileTz={user.timezone} />}

      <main id="main" className="mx-auto max-w-canvas px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav data-tour="nav" aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-container-lowest/90 pb-safe backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,0,0,0.35)] lg:hidden">
        <ul className="grid grid-cols-6">
          {NAV.filter((n) => n.primary).map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined}
                  className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide', active ? 'text-primary' : 'text-on-surface-variant')}>
                  <Icon name={n.icon} filled={active} className="text-[22px]" />
                  {t(n.labelKey)}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog"
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide text-on-surface-variant">
              <Icon name="menu" className="text-[22px]" />{t('nav.more')}
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        <ul className="grid grid-cols-2 gap-2">
          {[...NAV.filter((n) => !n.primary), { href: '/profile', label: 'Profile', labelKey: 'nav.profile' as const, icon: 'person' }, { href: '/notifications', label: 'Notifications', labelKey: 'nav.notifications' as const, icon: 'notifications' }].map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="flex h-14 items-center gap-3 rounded-lg border border-outline-variant bg-surface-container px-4 text-label-md">
                <Icon name={n.icon} className="text-secondary" />{t(n.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function useSessionGuard(timeoutHours: number) {
  const router = useRouter();
  const last = useRef(Date.now());
  useEffect(() => {
    document.cookie = `${TIMEOUT_COOKIE}=${timeoutHours}; path=/; samesite=lax; max-age=31536000`;
    const bump = () => { last.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - last.current > timeoutHours * 3_600_000) {
        window.clearInterval(timer);
        try { await getBrowserClient()?.auth.signOut(); } catch { /* still redirect */ }
        router.replace('/login?reason=timeout');
      }
    }, 60_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); window.clearInterval(timer); };
  }, [timeoutHours, router]);
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function OrgSwitcher({ current, workspaces }: { current: ShellProps['org']; workspaces: ShellProps['workspaces'] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const ref = useClickOutside(open, () => setOpen(false));
  async function choose(slug: string) {
    if (slug === current.slug) { setOpen(false); return; }
    setBusy(slug);
    try {
      await postJson('/api/org/switch', { slug });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast(t('shell.switch_failed', { error: errorMessage(e) }), 'error');
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={t('shell.current_ws', { name: current.name })}
        className="flex h-9 max-w-[11rem] items-center gap-1 rounded border border-outline-variant bg-surface-container px-2.5 text-label-sm text-on-surface hover:bg-surface-container-high">
        <span className="truncate">{current.name}</span>
        <Icon name="expand_more" className="text-[18px]" />
      </button>
      {open && (
        <div role="menu" aria-label={t('shell.workspaces')} className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-outline-variant bg-surface-container-high p-1 shadow-l2">
          {workspaces.map((w) => (
            <button key={w.slug} role="menuitemradio" aria-checked={w.slug === current.slug} type="button" onClick={() => choose(w.slug)} disabled={!!busy}
              className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-body-md hover:bg-on-surface/5 disabled:opacity-60">
              <span className="min-w-0">
                <span className="block truncate text-on-surface">{w.name}</span>
                <span className="block text-body-sm text-on-surface-variant">{t(`role.${w.role}`)}</span>
              </span>
              {busy === w.slug ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                : w.slug === current.slug ? <Icon name="check" className="text-primary" /> : null}
            </button>
          ))}
          <div className="my-1 border-t border-outline-variant" />
          <Link role="menuitem" href="/onboarding?new=1" className="flex items-center gap-2 rounded px-3 py-2 text-body-md text-on-surface-variant hover:bg-on-surface/5">
            <Icon name="add" />{t('shell.create_ws')}
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ user }: { user: ShellProps['user'] }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(user.theme);
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const ref = useClickOutside(open, () => setOpen(false));

  async function signOut() {
    setSigningOut(true);
    try {
      const supabase = getBrowserClient();
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      router.replace('/login');
      router.refresh();
    } catch (e) {
      toast(t('shell.signout_failed', { error: errorMessage(e) }), 'error');
      setSigningOut(false);
    }
  }
  async function pickTheme(th: ThemePref) {
    setTheme(th);
    applyTheme(th);
    try {
      const supabase = getBrowserClient();
      if (supabase) {
        const { error } = await supabase.from('profiles').update({ theme: th }).eq('id', user.id);
        if (error) throw error;
      }
    } catch (e) {
      toast(t('shell.theme_not_saved', { error: errorMessage(e) }), 'error');
    }
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('shell.account_menu')} className="rounded-full p-1 hover:bg-on-surface/5">
        <Avatar name={user.name} src={user.avatar} size={30} />
      </button>
      {open && (
        <div role="menu" aria-label={t('shell.account')} className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-outline-variant bg-surface-container-high p-1 shadow-l2">
          <div className="px-3 py-2">
            <p className="truncate text-label-md text-on-surface">{user.name}</p>
            <p className="truncate text-body-sm text-on-surface-variant">{user.email}</p>
          </div>
          <div className="my-1 border-t border-outline-variant" />
          <Link role="menuitem" href="/profile" className="flex items-center gap-2 rounded px-3 py-2 text-body-md hover:bg-on-surface/5"><Icon name="person" />{t('shell.profile_security')}</Link>
          {user.founder && <Link role="menuitem" href="/founder" className="flex items-center gap-2 rounded px-3 py-2 text-body-md hover:bg-on-surface/5"><Icon name="monitoring" />{t('shell.founder')}</Link>}
          <div className="px-3 py-2" role="group" aria-label={t('shell.theme')}>
            <p className="mb-1 text-label-xs uppercase text-on-surface-variant">{t('shell.theme')}</p>
            <div className="flex gap-1">
              {(['system', 'dark', 'light'] as const).map((th) => (
                <button key={th} type="button" role="menuitemradio" aria-checked={theme === th} onClick={() => pickTheme(th)}
                  className={cn('h-8 flex-1 rounded border text-label-sm', theme === th ? 'border-primary-container bg-primary-container/15 text-on-surface' : 'border-outline-variant text-on-surface-variant')}>
                  {t(`shell.theme.${th}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="my-1 border-t border-outline-variant" />
          <button role="menuitem" type="button" onClick={signOut} disabled={signingOut}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-body-md text-alert hover:bg-on-surface/5 disabled:opacity-60">
            <Icon name="logout" />{signingOut ? t('shell.signing_out') : t('shell.signout')}
          </button>
        </div>
      )}
    </div>
  );
}

/** The workspace's own logo (Settings → Branding), in place of the OrbitOS mark. */
function OrgLogo({ url, name, compact }: { url: string; name: string; compact?: boolean }) {
  const t = useT();
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2 rounded text-on-surface" aria-label={`${name} · OrbitOS`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small public image from Supabase Storage */}
      <img src={url} alt={t('brand.logo_alt', { org: name })} className={compact ? 'h-7 max-w-[96px] object-contain' : 'h-8 max-w-[120px] object-contain'} />
      {!compact && <span className="truncate text-headline-sm tracking-tight">{name}</span>}
    </Link>
  );
}
