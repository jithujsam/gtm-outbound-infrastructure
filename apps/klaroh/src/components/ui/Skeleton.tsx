// Loading placeholders shaped like the real UI (same panel chrome, table rows and KPI
// grid), so content replaces them without the page jumping. Server-safe, motion-safe.

import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('rounded-md bg-outline-variant/25 motion-safe:animate-pulse', className)} />;
}

/** Announces loading to assistive tech; the skeleton blocks themselves are hidden. */
export function LoadingRegion({ children, label = 'Loading' }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Title (page-title height) + optional subtitle line, as PageHeader renders them. */
export function SkeletonPageHeader({ subtitle = true, action = false }: { subtitle?: boolean; action?: boolean }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-56 md:h-9" />
        {subtitle && <Skeleton className="mt-2 h-4 w-full max-w-md" />}
      </div>
      {/* The header's sync row (status + Sync button), so the page doesn't jump when it loads. */}
      {action && <Skeleton className="h-8 w-full max-w-80 sm:w-80" />}
    </div>
  );
}

/** Section tab row (Infrastructure sub-navigation). */
export function SkeletonTabs({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-4 flex gap-4 border-b border-outline-variant/50 py-2.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-4 w-20" />
      ))}
    </div>
  );
}

/** Date-range control + filter selects row. */
export function SkeletonToolbar() {
  return (
    <div className="mb-4 flex flex-wrap gap-2" aria-hidden="true">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/** Same chrome as Panel: border, optional header bar. */
export function SkeletonPanel({ title = true, className, children }: { title?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section aria-hidden="true" className={clsx('min-w-0 overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest', className)}>
      {title && (
        <div className="border-b border-outline-variant/40 px-4 py-3 md:px-5">
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      {children}
    </section>
  );
}

/** Hairline KPI grid, like KpiGroupPanel. */
export function SkeletonCells({ count = 4 }: { count?: number }) {
  return (
    <div className={clsx('grid grid-cols-2 gap-px bg-outline-variant/40', count >= 6 ? 'sm:grid-cols-3 lg:grid-cols-6' : count === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-surface-container-lowest px-4 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-6 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonKpiPanel({ count = 4 }: { count?: number }) {
  return (
    <SkeletonPanel>
      <SkeletonCells count={count} />
    </SkeletonPanel>
  );
}

/** Header row + body rows at compact density (32px). */
export function SkeletonTable({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden="true">
      <div className="flex gap-4 bg-surface-container-low px-3 py-2">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={clsx('h-3', i === 0 ? 'w-32' : 'w-14')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-t border-outline-variant/30 px-3 py-2">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={clsx('h-4', i === 0 ? 'w-32' : 'w-14')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div className="px-4 py-3 md:px-5" aria-hidden="true">
      <Skeleton className="mb-3 h-6 w-48" />
      <div style={{ height }}>
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}
