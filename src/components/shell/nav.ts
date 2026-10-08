export interface NavItem { href: string; label: string; icon: string; primary?: boolean }

/** One unified nav (the Stitch export had a 5-tab and a 7-tab variant). First five are mobile tabs. */
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid_view', primary: true },
  { href: '/operations', label: 'Operations', icon: 'view_kanban', primary: true },
  { href: '/scheduling', label: 'Scheduling', icon: 'schedule', primary: true },
  { href: '/culture', label: 'Culture', icon: 'auto_awesome', primary: true },
  { href: '/compliance', label: 'Compliance', icon: 'verified_user', primary: true },
  { href: '/reports', label: 'Reports', icon: 'analytics' },
  { href: '/people', label: 'People', icon: 'groups' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}
