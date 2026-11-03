'use client';

// The behaviour every dialog needs, in one place, so the simple Modal and the large
// bespoke dialogs (Settings, Connect ESP, the mobile More sheet) cannot drift apart:
//   - the page behind does not scroll (reference-counted, so stacked dialogs are safe,
//     and the scrollbar's width is kept so the layout does not jump)
//   - Escape closes the topmost dialog only
//   - Tab / Shift+Tab stay inside the dialog
//   - focus moves in on open (first `data-autofocus`, else the first field/button in the
//     body, else the dialog itself) and returns to what opened it on close

import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── scroll lock (module-level so nested dialogs share it) ────────────────────
let lockCount = 0;
let restore: (() => void) | null = null;

function lockScroll() {
  if (lockCount++ > 0) return;
  const body = document.body;
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  body.style.overflow = 'hidden';
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  restore = () => {
    body.style.overflow = prev.overflow;
    body.style.paddingRight = prev.paddingRight;
  };
}

function unlockScroll() {
  if (--lockCount > 0) return;
  lockCount = 0;
  restore?.();
  restore = null;
}

/** Locks page scroll while `active`. Use alone for non-modal overlays. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}

// ── stacking: only the topmost dialog reacts to Escape / Tab ─────────────────
const stack: symbol[] = [];

export function useDialogBehavior({
  open,
  panelRef,
  onClose,
  dismissible = true,
}: {
  open: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** false while busy (submitting) or for must-answer dialogs: Escape does nothing. */
  dismissible?: boolean;
}) {
  // Keep the latest callbacks without re-running the effect (and re-stealing focus).
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    closeRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    stack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    // initial focus
    if (panel && !panel.contains(document.activeElement)) {
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      const first = preferred ?? panel.querySelector<HTMLElement>(`[data-dialog-body] :is(${FOCUSABLE})`) ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        if (dismissibleRef.current) {
          e.stopPropagation();
          closeRef.current();
        }
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // give focus back, unless something else (e.g. the next dialog) already took it
      if (opener && opener.isConnected && (document.activeElement === document.body || panel?.contains(document.activeElement) || !document.activeElement)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);
}
