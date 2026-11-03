'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, LogOut, X } from 'lucide-react';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MORE_NAV, hrefFrom, type NavDestination } from './nav/nav-config';
import { useAccount } from './nav/useAccount';
import { useDialogBehavior } from './ui/useDialogBehavior';

const ROW = 'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors active:bg-surface-container focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

/**
 * Bottom sheet for the destinations that don't fit the tab bar (Infrastructure,
 * Clients, Settings) and the account (agency + log out).
 */
export default function MobileMoreSheet({
  open,
  pathname,
  search,
  onClose,
  onSettings,
}: {
  open: boolean;
  pathname: string;
  search: string;
  onClose: () => void;
  onSettings: () => void;
}) {
  const reduced = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  // Fetch the agency only once the sheet has been opened.
  const [everOpened, setEverOpened] = useState(false);
  const { name, initials, logoUrl, loggingOut, logout } = useAccount(everOpened);
  if (open && !everOpened) setEverOpened(true);

  // Escape, focus trap, scroll lock and focus return (shared with every dialog).
  useDialogBehavior({ open, panelRef: sheetRef, onClose });

  const itemClass = (active: boolean) => clsx(ROW, active ? 'bg-primary-fixed/40 font-medium text-primary' : 'text-on-surface');

  const renderItem = (dest: NavDestination) => {
    const active = dest.isActive(pathname);
    const body = (
      <>
        <dest.icon size={20} aria-hidden="true" className={active ? 'text-primary' : 'text-on-surface-variant'} />
        {dest.label}
      </>
    );
    return (
      <li key={dest.key}>
        {dest.kind === 'link' ? (
          <Link href={hrefFrom(pathname, search, dest)} onClick={onClose} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
            {body}
          </Link>
        ) : (
          <button type="button" onClick={onSettings} aria-haspopup="dialog" aria-current={active ? 'page' : undefined} className={itemClass(active)}>
            {body}
          </button>
        )}
      </li>
    );
  };

  const t = reduced ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-on-surface/40"
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-outline-variant/40 bg-surface-container-lowest px-4 pt-2 shadow-modal outline-none"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={t}
          >
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-outline-variant" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <h2 className="type-section text-on-surface">More</h2>
              <button type="button" onClick={onClose} aria-label="Close menu" className="btn btn-ghost btn-icon -mr-2">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="More destinations" className="mt-3">
              <ul className="flex flex-col gap-1">{MORE_NAV.map(renderItem)}</ul>
            </nav>

            <div className="mt-3 border-t border-outline-variant/40 pt-3">
              <div className="flex items-center gap-3 px-3 pb-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-on-primary">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <p className="type-caption text-on-surface-variant">Signed in as</p>
                  <p className="truncate text-sm font-medium text-on-surface">{name}</p>
                </div>
              </div>
              <button type="button" onClick={logout} disabled={loggingOut} className={clsx(ROW, 'text-error disabled:opacity-50')}>
                {loggingOut ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <LogOut size={20} aria-hidden="true" />}
                Log out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
