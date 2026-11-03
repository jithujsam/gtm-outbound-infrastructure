// Single source of truth for primary navigation: names, icons, routes and
// active-state rules. Desktop sidebar, mobile bottom bar and the mobile "More"
// sheet all read from here, so one destination always has one name.

import { Compass, Inbox, LayoutGrid, Megaphone, Server, Settings2, type LucideIcon } from 'lucide-react';

export type NavKey = 'overview' | 'campaigns' | 'inbox' | 'infrastructure' | 'clients' | 'settings';

export interface NavDestination {
  key: NavKey;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Settings opens a dialog instead of navigating. */
  kind: 'link' | 'dialog';
  isActive: (pathname: string) => boolean;
}

const within = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const NAV: Record<NavKey, NavDestination> = {
  overview: { key: 'overview', label: 'Overview', href: '/dashboard', icon: Compass, kind: 'link', isActive: (p) => p === '/dashboard' },
  campaigns: { key: 'campaigns', label: 'Campaigns', href: '/campaigns', icon: Megaphone, kind: 'link', isActive: within('/campaigns') },
  inbox: { key: 'inbox', label: 'Inbox', href: '/inbox', icon: Inbox, kind: 'link', isActive: within('/inbox') },
  infrastructure: { key: 'infrastructure', label: 'Infrastructure', href: '/infrastructure', icon: Server, kind: 'link', isActive: within('/infrastructure') },
  clients: { key: 'clients', label: 'Clients', href: '/clients', icon: LayoutGrid, kind: 'link', isActive: within('/clients') },
  settings: { key: 'settings', label: 'Settings', href: '/settings', icon: Settings2, kind: 'dialog', isActive: within('/settings') },
};

/** Desktop sidebar, top group: the pages people work in, in order. */
export const DESKTOP_NAV: NavDestination[] = [NAV.overview, NAV.campaigns, NAV.inbox, NAV.infrastructure, NAV.clients];

/** Desktop sidebar, bottom group: workspace configuration (opens a dialog), beside the account. */
export const DESKTOP_SECONDARY_NAV: NavDestination[] = [NAV.settings];

/**
 * Mobile bottom bar: the daily destinations, directly reachable. Inbox is here
 * because replies are acted on daily; Infrastructure is a periodic health check
 * and "Infrastructure" does not fit a fifth tab without truncating.
 */
export const MOBILE_TABS: NavDestination[] = [NAV.overview, NAV.campaigns, NAV.inbox];

/** Mobile "More" sheet: everything else. */
export const MORE_NAV: NavDestination[] = [NAV.infrastructure, NAV.clients, NAV.settings];

/** Analytics list pages share filters (range, client, campaign, provider) via the URL. */
const ANALYTICS_LIST = (p: string) => p === '/dashboard' || p === '/campaigns' || p === '/infrastructure' || p.startsWith('/infrastructure/');

/**
 * Where a primary link should point from the current page. Moving between
 * Overview, Campaigns and Infrastructure keeps the active filters, as the old
 * in-page tab row did.
 */
export function hrefFrom(pathname: string, search: string, dest: NavDestination): string {
  const carries = dest.key === 'overview' || dest.key === 'campaigns' || dest.key === 'infrastructure';
  return carries && search && ANALYTICS_LIST(pathname) ? `${dest.href}?${search}` : dest.href;
}
