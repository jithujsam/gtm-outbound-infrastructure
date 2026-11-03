import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, CircleSlash, Info, XCircle } from 'lucide-react';

export type StatusTone = 'good' | 'neutral' | 'warning' | 'critical' | 'info';

const TONE: Record<StatusTone, { cls: string; Icon: LucideIcon }> = {
  good: { cls: 'bg-success-container text-on-success-container', Icon: CheckCircle2 },
  neutral: { cls: 'bg-surface-container text-on-surface-variant', Icon: CircleSlash },
  warning: { cls: 'bg-warning-container text-on-warning-container', Icon: AlertTriangle },
  critical: { cls: 'bg-critical-container text-on-critical-container', Icon: XCircle },
  info: { cls: 'bg-info-container text-on-info-container', Icon: Info },
};

/**
 * Pill-shaped status marker. Status is never colour alone: every chip carries an
 * icon (the tone's default, or `icon` to say something more specific) plus a label.
 * Pass `icon={false}` only where the label already sits beside an icon.
 */
export function StatusChip({
  tone,
  icon,
  children,
  title,
  className,
}: {
  tone: StatusTone;
  icon?: LucideIcon | false;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  const { cls, Icon: DefaultIcon } = TONE[tone];
  const Icon = icon === false ? null : (icon ?? DefaultIcon);
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', cls, className)} title={title}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}
