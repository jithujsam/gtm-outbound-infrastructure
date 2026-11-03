'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import { useSidebar } from './SidebarContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { Share2, ExternalLink, SlidersHorizontal } from 'lucide-react';
import Toggle from './Toggle';
import clsx from 'clsx';
import { NAV } from './nav/nav-config';
import { MotionConfig } from 'framer-motion';

/** The client's report: readable slug + the private token that opens it. */
const portalUrl = (slug: string, token: string) => `/c/${encodeURIComponent(slug)}/${token}`;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isSidebarCollapsed, setIsSidebarCollapsed, headerActions } = useSidebar();
  const pathname = usePathname();
  const [shareLabel, setShareLabel] = useState('Copy report link');

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('klaroh_sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleToggleStatus = async () => {
    if (!headerActions) return;
    const currentStatus = headerActions.clientStatus;
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    // Optimistic update
    headerActions.setClientStatus(newStatus);
    try {
      const response = await fetch('/api/update-client-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: headerActions.clientId, status: newStatus }),
      });
      if (!response.ok) {
        headerActions.setClientStatus(currentStatus);
      }
    } catch {
      headerActions.setClientStatus(currentStatus);
    }
  };

  const handleShareView = async () => {
    if (!headerActions?.portalToken) return;
    const url = `${window.location.origin}${portalUrl(headerActions.clientSlug, headerActions.portalToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel('Copied!');
      setTimeout(() => setShareLabel('Copy report link'), 2000);
    } catch {
      // ignore
    }
  };

  const formatSlug = (slug: string) => {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Breadcrumbs use the primary navigation names and only appear on nested pages;
  // a top-level page is already named by the nav and its own title.
  const getBreadcrumbs = () => {
    const parts = pathname.split('/').filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];
    switch (parts[0]) {
      case 'campaigns':
        crumbs.push({ label: NAV.campaigns.label, href: NAV.campaigns.href });
        if (parts[1]) crumbs.push({ label: 'Campaign', href: pathname });
        break;
      // Infrastructure sub-pages are named by their sub-navigation row, so they get no breadcrumb.
      case 'infrastructure':
        break;
      case 'clients':
        crumbs.push({ label: NAV.clients.label, href: NAV.clients.href });
        if (parts[1]) crumbs.push({ label: formatSlug(parts[1]), href: `/clients/${parts[1]}` });
        if (parts[2] === 'portal') crumbs.push({ label: 'Client portal', href: pathname });
        break;
      case 'settings':
        crumbs.push({ label: NAV.settings.label, href: NAV.settings.href });
        if (parts[1]) crumbs.push({ label: formatSlug(parts[1]), href: pathname });
        break;
      default:
        break; // /dashboard (Overview) and anything else: no breadcrumb
    }
    return crumbs;
  };

  const crumbs = getBreadcrumbs();
  const canShare = headerActions?.clientStatus === 'active' && !!headerActions.portalToken;
  const showHeader = crumbs.length > 1 || !!headerActions;

  return (
    // framer-motion follows the OS "reduce motion" setting everywhere in the app.
    <MotionConfig reducedMotion="user">
    <div className="bg-background">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
      {/* Offset by the sidebar from CSS (no JS width), so first paint never jumps */}
      <main
        className={clsx(
          'min-h-screen bg-background pb-20 lg:pb-0 lg:transition-[margin-left] lg:duration-300 lg:ease-[cubic-bezier(0.25,0.1,0.25,1)]',
          isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        {/* Top Header Bar with Breadcrumbs */}
        {showHeader && (
        <header className="flex h-14 items-center justify-between gap-3 border-b border-outline-variant/30 bg-surface px-4 md:px-6 lg:px-8">
          {/* Left: Breadcrumbs */}
          {crumbs.length > 1 ? (
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-2 font-sans text-xs font-medium tracking-wide">
                {crumbs.map((crumb, idx) => {
                  const last = idx === crumbs.length - 1;
                  return (
                    // Phones show only the parent link (the way back); the full trail from sm up.
                    <li key={crumb.href} className={clsx('items-center gap-2', idx === 0 ? 'flex' : 'hidden sm:flex', last ? 'min-w-0' : 'shrink-0')}>
                      {idx > 0 && <span className="select-none text-on-surface-variant/40" aria-hidden="true">/</span>}
                      {last ? (
                        <span aria-current="page" className="truncate font-semibold text-primary">{crumb.label}</span>
                      ) : (
                        <Link href={crumb.href} className="text-on-surface-variant transition-colors hover:text-primary">
                          {crumb.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : (
            <span />
          )}

          {/* Right: Dynamic Client Actions */}
          {headerActions && (
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* Live Status Toggle */}
              <div className="flex items-center gap-2 border-r border-outline-variant/30 pr-2 sm:gap-3 sm:pr-3">
                <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:inline-flex ${
                  headerActions.clientStatus === 'active'
                    ? 'bg-primary-fixed/30 text-primary'
                    : 'bg-surface-container text-on-surface-variant'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    headerActions.clientStatus === 'active'
                      ? 'bg-primary animate-pulse'
                      : 'bg-on-surface-variant/40'
                  }`} />
                  {headerActions.clientStatus === 'active' ? 'Live' : 'Offline'}
                </span>
                <Toggle
                  isOn={headerActions.clientStatus === 'active'}
                  onToggle={handleToggleStatus}
                  ariaLabel="Toggle client live status"
                />
              </div>

              {/* What the client sees */}
              <Link
                href={`/clients/${headerActions.clientSlug}/portal`}
                className="btn btn-secondary btn-sm"
                title="Choose what your client sees"
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Client portal</span>
              </Link>

              {/* Share Public View Link */}
              <button
                onClick={handleShareView}
                title={shareLabel}
                disabled={!canShare}
                aria-label="Copy the client's report link"
                className="btn btn-secondary btn-icon btn-sm text-on-surface-variant"
              >
                <Share2 size={16} aria-hidden="true" />
              </button>

              {/* View as Client (External link) */}
              <a
                href={canShare ? `${portalUrl(headerActions.clientSlug, headerActions.portalToken!)}?preview=true` : '#'}
                target={canShare ? '_blank' : undefined}
                rel="noopener noreferrer"
                title="View as Client"
                aria-label="Preview the client's report"
                aria-disabled={!canShare || undefined}
                className={clsx('btn btn-secondary btn-icon btn-sm text-on-surface-variant', !canShare && 'pointer-events-none opacity-50')}
              >
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          )}
        </header>
        )}

        {children}
      </main>
      <MobileBottomNav />
    </div>
    </MotionConfig>
  );
}




