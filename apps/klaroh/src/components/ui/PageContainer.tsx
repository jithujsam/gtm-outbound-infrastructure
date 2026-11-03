import clsx from 'clsx';

/**
 * Standard page frame for authenticated pages: page gutter (16 / 24 / 32px),
 * bottom breathing room on large screens, content capped at max-w-page (1440px).
 */
export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="px-4 py-5 md:px-6 lg:px-8 lg:pb-16">
      <div className={clsx('mx-auto max-w-page', className)}>{children}</div>
    </div>
  );
}
