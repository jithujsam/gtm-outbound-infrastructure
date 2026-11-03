import type { LucideIcon } from 'lucide-react';

/**
 * Centred message for full-page states (error, not found). The page chrome (sidebar,
 * header) stays around it; actions are passed as children.
 */
export function StateMessage({
  icon: Icon,
  title,
  children,
  actions,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Small print, e.g. an error reference. */
  detail?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
          <Icon size={22} aria-hidden="true" />
        </div>
        <h1 className="type-section text-on-surface">{title}</h1>
        <p className="mt-2 text-sm text-on-surface-variant">{children}</p>
        {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
        {detail && <p className="mt-6 text-xs text-on-surface-variant">{detail}</p>}
      </div>
    </div>
  );
}
