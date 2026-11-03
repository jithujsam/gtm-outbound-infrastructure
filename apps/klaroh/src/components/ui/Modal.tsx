'use client';

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useDialogBehavior } from './useDialogBehavior';

const SIZE = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-3xl' } as const;

/**
 * The one dialog for Klaroh. Centred panel, one z-index, one backdrop, one set of
 * behaviours (see useDialogBehavior): focus in and back, Tab trap, Escape, page scroll
 * locked, `aria-labelledby` / `aria-describedby`. The body scrolls inside the panel, so a
 * tall form never pushes the dialog off screen.
 *
 *   <Modal open onClose title="Create client" footer={<>…buttons…</>}>…fields…</Modal>
 *
 * - `variant="alert"` for destructive confirmations (role=alertdialog). Put
 *   `data-autofocus` on the safe button (Cancel) so focus starts there.
 * - `dismissOnBackdrop={false}` for forms, so a stray click never discards typed input.
 * - `busy` blocks every way of closing while a request is in flight.
 * - `dismissible={false}` is for must-answer dialogs (no close button, no Escape).
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = 'md',
  variant = 'dialog',
  dismissible = true,
  dismissOnBackdrop = true,
  busy = false,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  size?: keyof typeof SIZE;
  variant?: 'dialog' | 'alert';
  dismissible?: boolean;
  dismissOnBackdrop?: boolean;
  busy?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const canClose = dismissible && !busy;
  useDialogBehavior({ open, panelRef, onClose, dismissible: canClose });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="modal-backdrop absolute inset-0 bg-on-surface/40" aria-hidden="true" onClick={canClose && dismissOnBackdrop ? onClose : undefined} />
      <div
        ref={panelRef}
        role={variant === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={clsx('modal-panel relative flex max-h-[90dvh] w-full flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-modal outline-none', SIZE[size], className)}
      >
        <header className="flex items-start gap-3 px-6 pb-2 pt-6">
          {icon && <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-error-container text-error">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="type-section text-on-surface">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-on-surface-variant">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="btn btn-ghost btn-icon btn-sm -mr-2 -mt-1 flex-shrink-0">
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </header>
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3">
          {children}
        </div>
        {footer && <footer className="flex flex-wrap justify-end gap-3 px-6 pb-6 pt-3">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
