import clsx from 'clsx';

/**
 * The standard card: flat, 1px hairline border, 8px radius. An optional header
 * carries the section title (16px semibold), a caption-size subtitle and an
 * action slot. Server-safe.
 */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('min-w-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-outline-variant/40 px-4 py-3 md:px-5">
          <div className="min-w-0">
            {title && <h2 className="type-section text-on-surface">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
