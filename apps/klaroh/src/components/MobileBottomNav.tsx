'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Ellipsis } from 'lucide-react';
import { motion, LayoutGroup } from 'framer-motion';
import SettingsModal from './SettingsModal';
import MobileMoreSheet from './MobileMoreSheet';
import { MOBILE_TABS, MORE_NAV, hrefFrom } from './nav/nav-config';

const ACTIVE_COLOR = 'var(--color-primary)';
const INACTIVE_COLOR = 'var(--color-on-surface-variant)';
const PILL_BG = 'var(--color-primary-fixed)';

// Critically damped: the pill slides to the new tab without overshoot.
const spring = { type: 'spring' as const, stiffness: 500, damping: 40 };

const TAB = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 active:opacity-70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

/** Icon with the shared active pill behind it. */
function TabIcon({ Icon, active }: { Icon: typeof Ellipsis; active: boolean }) {
  return (
    <div className="relative flex items-center justify-center px-4 py-1">
      {active && <motion.div layoutId="tab-pill" className="absolute inset-0 rounded-full" style={{ backgroundColor: PILL_BG }} transition={spring} />}
      <Icon size={20} className="relative z-10 transition-colors duration-150" style={{ color: active ? ACTIVE_COLOR : INACTIVE_COLOR }} aria-hidden="true" />
    </div>
  );
}

function TabLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{ color: active ? ACTIVE_COLOR : INACTIVE_COLOR }}
      className="font-sans max-w-full truncate text-xs font-medium leading-none transition-colors duration-150"
    >
      {children}
    </span>
  );
}

/**
 * Bottom bar: Overview, Campaigns, Inbox, More (Infrastructure, Clients, Settings, account).
 */
export default function MobileBottomNav() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // More is highlighted while open, and on the pages that live inside it.
  const moreActive = moreOpen || MORE_NAV.some((d) => d.isActive(pathname));

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-outline-variant/40 bg-surface-container-lowest lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <LayoutGroup id="bottom-nav">
          {MOBILE_TABS.map((dest) => {
            const active = dest.isActive(pathname);
            return (
              <Link key={dest.key} href={hrefFrom(pathname, search, dest)} aria-current={active ? 'page' : undefined} className={TAB}>
                <TabIcon Icon={dest.icon} active={active} />
                <TabLabel active={active}>{dest.label}</TabLabel>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={TAB}
          >
            <TabIcon Icon={Ellipsis} active={moreActive} />
            <TabLabel active={moreActive}>More</TabLabel>
          </button>
        </LayoutGroup>
      </nav>

      <MobileMoreSheet
        open={moreOpen}
        pathname={pathname}
        search={search}
        onClose={() => setMoreOpen(false)}
        onSettings={() => {
          setMoreOpen(false);
          setSettingsOpen(true);
        }}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
