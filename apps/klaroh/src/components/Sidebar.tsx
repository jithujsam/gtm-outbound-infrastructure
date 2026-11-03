'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, Loader2, LogOut, MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import SettingsModal from './SettingsModal';
import { DESKTOP_NAV, DESKTOP_SECONDARY_NAV, hrefFrom, type NavDestination } from './nav/nav-config';
import { useAccount } from './nav/useAccount';

// 36px rows, 14px labels, 20px icons on a fixed 10px inset so icons stay put while the sidebar collapses.
const ITEM_BASE =
  'relative flex h-9 w-full items-center rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-primary';
const ITEM_IDLE = 'font-normal text-on-primary/70 hover:text-on-primary hover:bg-on-primary/10';
const ITEM_ACTIVE = 'font-medium text-on-primary bg-on-primary/15';

/** Icon + label that collapses with the sidebar. */
function ItemBody({ Icon, label, collapsed, active }: { Icon: LucideIcon; label: string; collapsed: boolean; active?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <>
      {/* Left indicator for the active destination */}
      {active && <span aria-hidden="true" className="absolute -left-3 inset-y-1.5 w-[3px] rounded-r-full bg-primary-fixed" />}
      <Icon size={20} className="absolute left-[10px] flex-shrink-0" aria-hidden="true" />
      <motion.span
        animate={{
          opacity: collapsed ? 0 : 1,
          width: collapsed ? 0 : 'auto',
          paddingLeft: collapsed ? 0 : 42,
        }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="font-sans text-sm whitespace-nowrap overflow-hidden inline-block"
      >
        {label}
      </motion.span>
    </>
  );
}

function NavLink({ item, collapsed, pathname, search }: { item: NavDestination; collapsed: boolean; pathname: string; search: string }) {
  const active = item.isActive(pathname);
  return (
    <Link
      href={hrefFrom(pathname, search, item)}
      prefetch={true}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={clsx(ITEM_BASE, active ? ITEM_ACTIVE : ITEM_IDLE)}
    >
      <ItemBody Icon={item.icon} label={item.label} collapsed={collapsed} active={active} />
    </Link>
  );
}

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isCollapsed: externalIsCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const reduced = useReducedMotion();
  const collapsed = externalIsCollapsed;
  const { name: userName, initials, logoUrl, loggingOut, logout } = useAccount();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [planStatus, setPlanStatus] = useState<{
    plan: string;
    daysRemaining: number;
    trialExpired: boolean;
    clientCount: number;
    limit: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/plan-status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setPlanStatus({
            plan: data.plan,
            daysRemaining: data.daysRemaining,
            trialExpired: data.trialExpired,
            clientCount: data.clientCount,
            limit: data.limit,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Escape closes the account menu and returns focus to its trigger.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const labelTransition = reduced ? { duration: 0 } : { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

  return (
    <>
    <motion.aside
      className="fixed left-0 top-0 z-40 hidden h-screen flex-shrink-0 flex-col bg-primary lg:flex shadow-sm"
      animate={{ width: collapsed ? 64 : 240 }}
      transition={labelTransition}
    >
      {/* Logo / header */}
      <div className="flex flex-col py-5 pl-[18px]">
        <div className="flex items-center">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg">
            <Image src="/logo.svg" alt="Klaroh" width={28} height={28} className="brightness-0 invert" />
          </div>
          <motion.span
            animate={{
              opacity: collapsed ? 0 : 1,
              width: collapsed ? 0 : 'auto',
              marginLeft: collapsed ? 0 : 8,
            }}
            transition={labelTransition}
            className="font-sans text-xl font-semibold tracking-tight text-on-primary whitespace-nowrap overflow-hidden inline-block"
          >
            Klaroh
          </motion.span>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
        {/* Primary navigation: the pages people work in */}
        <nav aria-label="Primary">
          <ul className="flex flex-col gap-0.5">
            {DESKTOP_NAV.map((item) => (
              <li key={item.key}>
                <NavLink item={item} collapsed={collapsed} pathname={pathname} search={search} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1" />

        {/* Trial / plan banner — expanded sidebar only */}
        <AnimatePresence>
          {!collapsed && planStatus?.plan === 'trial' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              transition={{ delay: 0.3, duration: 0.2, ease: 'easeOut' }}
              className="mb-3 rounded-lg border border-on-primary/20 bg-on-primary/5 px-3 py-2.5"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-sans text-xs font-semibold text-on-primary">Free trial</span>
                <span className="font-sans text-xs text-on-primary/70">
                  {planStatus.trialExpired ? 'Expired' : `${planStatus.daysRemaining} days left`}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-on-primary/20 mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    planStatus.trialExpired || planStatus.daysRemaining < 3
                      ? 'bg-error'
                      : planStatus.daysRemaining <= 5
                      ? 'bg-warning'
                      : 'bg-on-primary'
                  }`}
                  style={{
                    width: planStatus.trialExpired
                      ? '100%'
                      : `${Math.round(((14 - planStatus.daysRemaining) / 14) * 100)}%`,
                  }}
                />
              </div>
              <a
                href={`mailto:hello@klaroh.app?subject=Upgrade%20Klaroh%20Plan`}
                className="block font-sans text-xs text-on-primary hover:underline"
              >
                Switch to paid plan →
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Secondary: workspace settings (a dialog) and the sidebar control */}
        <ul className="flex flex-col gap-0.5">
          {DESKTOP_SECONDARY_NAV.map((item) => {
            // Settings opens the settings dialog; it is "current" only on /settings pages.
            const active = settingsOpen || item.isActive(pathname);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  title={collapsed ? item.label : undefined}
                  aria-haspopup="dialog"
                  aria-current={item.isActive(pathname) ? 'page' : undefined}
                  className={clsx(ITEM_BASE, active ? ITEM_ACTIVE : ITEM_IDLE)}
                >
                  <ItemBody Icon={item.icon} label={item.label} collapsed={collapsed} active={active} />
                </button>
              </li>
            );
          })}
          {onToggleCollapse && (
            <li>
              <button
                type="button"
                onClick={onToggleCollapse}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                className={clsx(ITEM_BASE, ITEM_IDLE)}
              >
                <ItemBody Icon={collapsed ? ChevronsRight : ChevronsLeft} label="Collapse" collapsed={collapsed} />
              </button>
            </li>
          )}
        </ul>

        {/* Divider */}
        <div className="my-2 h-px bg-on-primary/20" />

        {/* Account — reachable whether the sidebar is expanded or collapsed */}
        <div className="relative py-3">
          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Account menu, ${userName}`}
            className="flex w-full items-center gap-3 min-w-0 rounded-lg p-1 transition-all text-left hover:bg-on-primary/10 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-on-primary"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-on-primary/20 text-xs font-semibold text-on-primary ml-[4px]">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            {!collapsed && (
              <>
                <span className="font-sans min-w-0 flex-1 truncate text-xs font-semibold text-on-primary">{userName}</span>
                <MoreVertical size={18} className="mr-1 flex-shrink-0 text-on-primary/70" aria-hidden="true" />
              </>
            )}
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setMenuOpen(false)} />
                <motion.div
                  role="menu"
                  aria-label="Account"
                  initial={{ opacity: 0, scale: 0.95, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95, x: -10 }}
                  transition={{ duration: reduced ? 0 : 0.15, ease: 'easeOut' }}
                  className="absolute bottom-3 left-full z-50 ml-2 w-52 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-1 shadow-modal"
                >
                  <div className="border-b border-outline-variant/30 px-3 py-2">
                    <p className="font-sans text-xs text-on-surface-variant">Signed in as</p>
                    <p className="font-sans truncate text-sm font-medium text-on-surface">{userName}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    disabled={loggingOut}
                    className="font-sans mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-error hover:bg-error/10 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {loggingOut ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
                    <span>Log out</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
