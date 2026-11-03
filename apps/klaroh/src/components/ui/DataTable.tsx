// Shared table primitives for dense analytics. No hooks, so it works in server and
// client components alike (sorting state belongs to the caller; Th only renders it).
//
//   <DataTable label="Campaign comparison" minWidth={1120}>
//     <thead><tr><Th sticky sort="desc" onSort={…}>Campaign</Th><Th align="right">Sent</Th></tr></thead>
//     <tbody><Tr><Td sticky>…</Td><Td align="right">…</Td></Tr></tbody>
//   </DataTable>
//
// Behaviour:
//  - first column can stay put while scrolling sideways; the header row stays visible
//    only when a `maxHeight` is set (then the table scrolls inside its own region)
//  - a soft shadow on the scrolling edge shows there is more to see (mobile cue)
//  - 13px cells with tabular numerals; "compact" (32px rows) is the default,
//    "comfortable" (40px) for sparse tables
//  - the scroll region is keyboard-focusable and named, so it can be scrolled
//    without a mouse

import clsx from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';
export type Density = 'compact' | 'comfortable';

const CELL_PY: Record<Density, string> = { compact: '0.375rem', comfortable: '0.625rem' };

// Scroll shadows: opaque "covers" that hide a shadow until content is scrolled away
// from that edge. Colours are tokens; cells must stay translucent for them to show.
const COVER = 'var(--color-surface-container-lowest)';
const SHADOW = 'color-mix(in srgb, var(--color-on-surface) 22%, transparent)';
const scrollShadows: React.CSSProperties = {
  backgroundImage: [
    `linear-gradient(to right, ${COVER} 30%, transparent)`,
    `linear-gradient(to left, ${COVER} 30%, transparent)`,
    `radial-gradient(farthest-side at 0 50%, ${SHADOW}, transparent)`,
    `radial-gradient(farthest-side at 100% 50%, ${SHADOW}, transparent)`,
  ].join(','),
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'left center, right center, left center, right center',
  backgroundSize: '40px 100%, 40px 100%, 14px 100%, 14px 100%',
  backgroundAttachment: 'local, local, scroll, scroll',
};

export function DataTable({
  label,
  children,
  minWidth,
  density = 'compact',
  maxHeight = 'none',
  className,
}: {
  /** Accessible name of the scrolling region and the table. */
  label: string;
  children: React.ReactNode;
  /** Width below which the table scrolls sideways instead of squeezing. */
  minWidth?: number;
  density?: Density;
  /**
   * CSS max-height of the scroll region. Default `none`: the table grows and the page
   * scrolls (no scroll inside scroll). Set it for a table that should scroll on its own,
   * which is also what makes the sticky header work: sticky applies to the region that
   * scrolls, and a region that never scrolls vertically has nothing to stick to.
   */
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={clsx('overflow-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary', className)}
      style={{ ...scrollShadows, maxHeight }}
    >
      <table
        className="type-table w-full border-collapse"
        style={{ minWidth, ['--cell-py' as string]: CELL_PY[density] }}
      >
        {children}
      </table>
    </div>
  );
}

const HEAD_CELL = 'sticky top-0 z-20 whitespace-nowrap bg-surface-container-low px-3 py-[var(--cell-py)] align-middle text-xs font-medium leading-5 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--color-outline-variant)_70%,transparent)]';
const STICKY_COL = 'shadow-[inset_-1px_0_0_color-mix(in_srgb,var(--color-outline-variant)_45%,transparent)]';

/**
 * Column header. Pass `sort` (and `onSort`) to make it a sort button; `sort` is the
 * column's current direction, or `'none'` when the table is sorted by another column.
 */
export function Th({
  children,
  align = 'left',
  sticky,
  sort,
  onSort,
  title,
  className,
  scope = 'col',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  /** Keep this (first) column in view while scrolling sideways. */
  sticky?: boolean;
  sort?: SortDirection | 'none';
  onSort?: () => void;
  title?: string;
  className?: string;
  scope?: 'col' | 'row';
}) {
  const sorted = sort === 'asc' || sort === 'desc';
  return (
    <th
      scope={scope}
      title={title}
      aria-sort={sort === undefined ? undefined : sort === 'none' ? 'none' : sort === 'asc' ? 'ascending' : 'descending'}
      className={clsx(HEAD_CELL, align === 'right' ? 'text-right' : 'text-left', sticky ? clsx('left-0 z-30', STICKY_COL) : null, sorted ? 'text-on-surface' : 'text-on-surface-variant', className)}
    >
      {sort !== undefined && onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={clsx('inline-flex h-5 items-center gap-1 rounded-sm hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', align === 'right' && 'flex-row-reverse')}
        >
          {children}
          {sorted ? (sort === 'desc' ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />) : <span className="inline-block w-3" aria-hidden="true" />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/** Body row. `muted` dims rows that are no longer current; `onClick` makes the whole row a click target (keep a real button/link inside for keyboard users). */
export function Tr({ children, muted, className, onClick }: { children: React.ReactNode; muted?: boolean; className?: string; onClick?: () => void }) {
  return (
    <tr onClick={onClick} className={clsx('group border-t border-outline-variant/30 hover:bg-surface-container-low/50', muted && 'opacity-60', onClick && 'cursor-pointer', className)}>
      {children}
    </tr>
  );
}

export function Td({
  children,
  align = 'left',
  sticky,
  emphasis,
  muted,
  wrap,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  sticky?: boolean;
  /** Highlight the cell (e.g. the sorted column). */
  emphasis?: boolean;
  muted?: boolean;
  /** Allow text to wrap (cells don't wrap by default). */
  wrap?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={clsx(
        'px-3 py-[var(--cell-py)]',
        align === 'right' ? 'text-right' : 'text-left',
        !wrap && 'whitespace-nowrap',
        sticky && clsx('sticky left-0 z-10 bg-surface-container-lowest group-hover:bg-surface-container-low', STICKY_COL),
        emphasis ? 'font-semibold text-on-surface' : muted ? 'text-on-surface-variant' : 'text-on-surface',
        className
      )}
    >
      {children}
    </td>
  );
}

/** Single full-width message row (no results, nothing yet). */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-on-surface-variant">
        {children}
      </td>
    </tr>
  );
}
