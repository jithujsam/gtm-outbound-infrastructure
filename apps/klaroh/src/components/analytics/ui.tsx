// Presentational building blocks for the analytics pages. Server-safe (no hooks).

import Link from 'next/link';
import { AlertTriangle, Ban, CheckCheck, CheckCircle2, CircleDashed, CirclePause, CircleSlash, FilePen, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { CampaignStatus } from '@/lib/types';
import { Panel } from '@/components/ui/Panel';
import { StatusChip, type StatusTone } from '@/components/ui/StatusChip';

export { Panel };

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="type-page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Hairline-divided grid of cells (gap-px over a border-coloured background). */
export function CellGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('grid gap-px bg-outline-variant/40', className)}>{children}</div>;
}

export function Cell({
  label,
  value,
  sub,
  title,
  muted,
  emphasis,
  children,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  title?: string;
  muted?: boolean;
  emphasis?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col bg-surface-container-lowest px-4 py-3" title={title}>
      <p className="truncate text-xs text-on-surface-variant">{label}</p>
      <p
        className={clsx(
          'mt-1 truncate font-semibold leading-tight',
          emphasis ? 'text-2xl md:text-[28px]' : 'text-xl',
          muted ? 'text-on-surface-variant/60' : 'text-on-surface'
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant sm:truncate">{sub}</div>}
      {children}
    </div>
  );
}

const TONE_FILL: Record<Tone, string> = {
  good: 'bg-primary-container',
  warning: 'bg-warning',
  critical: 'bg-error',
  neutral: 'bg-outline',
  unknown: 'bg-outline-variant',
};

/** A value against a limit; the unfilled track is a lighter step of the same family. */
export function Meter({ value, max = 100, tone = 'good', label }: { value: number | null; max?: number; tone?: Tone; label?: string }) {
  const pctFilled = value === null || max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-container" role="meter" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      {value !== null && <div className={clsx('h-1.5 rounded-full', TONE_FILL[tone])} style={{ width: `${Math.max(pctFilled, value > 0 ? 2 : 0)}%` }} />}
    </div>
  );
}

/** Stacked distribution with a 2px surface gap between segments and an icon + label legend. */
export function DistributionBar({ title, segments, total }: { title: string; segments: { key: string; label: string; tone: Tone; count: number }[]; total: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-on-surface">{title}</p>
        <p className="text-xs text-on-surface-variant">{total} mailbox{total === 1 ? '' : 'es'}</p>
      </div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container">
        {segments.map((s) => (
          <div key={s.key} className={clsx('h-3 first:rounded-l-full last:rounded-r-full', TONE_FILL[s.tone])} style={{ width: `${(s.count / Math.max(total, 1)) * 100}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li key={s.key}>
            <ToneLabel tone={s.tone}>
              {s.label} <span className="text-on-surface-variant">{s.count}</span>
            </ToneLabel>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inline data bar for table cells (one hue). */
export function DataBar({ value, max }: { value: number | null; max: number }) {
  if (value === null || max <= 0) return null;
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-surface-container" aria-hidden="true">
      <div className="h-1 rounded-full bg-primary-container" style={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

// Paused / Completed / Draft each get their own tone and icon so they never read alike.
const STATUS_CHIP: Record<CampaignStatus, { label: string; tone: StatusTone; icon: typeof CheckCircle2 }> = {
  active: { label: 'Active', tone: 'good', icon: CheckCircle2 },
  paused: { label: 'Paused', tone: 'warning', icon: CirclePause },
  completed: { label: 'Completed', tone: 'info', icon: CheckCheck },
  draft: { label: 'Draft', tone: 'neutral', icon: FilePen },
  error: { label: 'Needs attention', tone: 'critical', icon: XCircle },
  suspended: { label: 'Suspended', tone: 'critical', icon: Ban },
  unknown: { label: 'Unknown', tone: 'neutral', icon: CircleDashed },
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.unknown;
  return (
    <StatusChip tone={s.tone} icon={s.icon}>
      {s.label}
    </StatusChip>
  );
}

export type Tone = 'good' | 'warning' | 'critical' | 'neutral' | 'unknown';

const TONE: Record<Tone, { cls: string; Icon: typeof CheckCircle2 }> = {
  good: { cls: 'text-primary-container', Icon: CheckCircle2 },
  warning: { cls: 'text-warning', Icon: AlertTriangle },
  critical: { cls: 'text-error', Icon: XCircle },
  neutral: { cls: 'text-on-surface-variant', Icon: CircleSlash },
  unknown: { cls: 'text-on-surface-variant/70', Icon: CircleDashed },
};

/** Status always carries an icon + label, never colour alone. */
export function ToneLabel({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const { cls, Icon } = TONE[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', cls)} title={title}>
      <Icon size={13} aria-hidden="true" />
      <span className="text-on-surface">{children}</span>
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary mt-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}
