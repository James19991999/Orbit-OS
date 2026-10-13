import type { MessageKey } from '@/i18n/shared';

export interface NavItem { href: string; label: string; labelKey: MessageKey; icon: string; primary?: boolean }

/** One unified nav (the Stitch export had a 5-tab and a 7-tab variant). First five are mobile tabs. */
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', labelKey: 'nav.dashboard', icon: 'grid_view', primary: true },
  { href: '/my-day', label: 'My day', labelKey: 'nav.my_day', icon: 'today' },
  { href: '/operations', label: 'Operations', labelKey: 'nav.operations', icon: 'view_kanban', primary: true },
  { href: '/scheduling', label: 'Scheduling', labelKey: 'nav.scheduling', icon: 'schedule', primary: true },
  { href: '/culture', label: 'Culture', labelKey: 'nav.culture', icon: 'auto_awesome', primary: true },
  { href: '/compliance', label: 'Compliance', labelKey: 'nav.compliance', icon: 'verified_user', primary: true },
  { href: '/reports', label: 'Reports', labelKey: 'nav.reports', icon: 'analytics' },
  { href: '/people', label: 'People', labelKey: 'nav.people', icon: 'groups' },
  { href: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: 'settings' },
  { href: '/help', label: 'Help', labelKey: 'nav.help', icon: 'help' },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}
