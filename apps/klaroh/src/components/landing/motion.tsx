'use client';

// Motion for the landing page. framer-motion (already a dependency), loaded lazily
// through LazyMotion. Restrained by design: opacity + small translate, once per
// element, no loops, no parallax. `reducedMotion="user"` removes transforms for
// people who ask for less motion.

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LazyMotion, MotionConfig, domAnimation, m, type Variants } from 'framer-motion';

export const EASE = [0.16, 1, 0.3, 1] as const;

export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Fades and rises into place the first time it is ~10% inside the viewport. */
export function Reveal({ children, delay = 0, y = 16, className }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <m.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

/** A group whose direct <StaggerItem> children enter one after another (0.07s apart). */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div data-reveal className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
      {children}
    </m.div>
  );
}
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div data-reveal className={className} variants={item}>
      {children}
    </m.div>
  );
}

/** A hairline that draws left to right as it enters view: shows the order of a sequence. */
export function Draw({ className }: { className?: string }) {
  return (
    <m.span
      aria-hidden="true"
      data-reveal
      className={`block origin-left ${className ?? ''}`}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: EASE }}
    />
  );
}

/** Call-to-action link with spring hover and press feedback (feedback, not decoration). */
export function Cta({ href, children, variant = 'primary', small, large, className }: { href: string; children: React.ReactNode; variant?: 'primary' | 'ghost' | 'light' | 'mint' | 'line'; small?: boolean; large?: boolean; className?: string }) {
  return (
    <m.a
      href={href}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className={`lp-btn lp-btn-${variant}${small ? ' lp-btn-sm' : ''}${large ? ' lp-btn-lg' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </m.a>
  );
}

/** Mobile-only page menu: a disclosure button that opens the three in-page links. Closes on
 *  link click, Escape, and outside click. Hidden from md up, where the inline nav shows. */
export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="md:hidden">
      <m.button
        type="button"
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        aria-expanded={open}
        aria-controls="landing-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors duration-200 hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </m.button>
      {open && (
        <m.nav id="landing-menu" aria-label="Page" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }} className="absolute inset-x-0 top-[calc(100%+0.5rem)] rounded-2xl border border-outline-variant/60 bg-white p-2 shadow-modal">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-4 text-base font-medium text-on-surface transition-colors duration-200 hover:bg-surface-container active:bg-surface-container-high">
              {l.label}
            </a>
          ))}
        </m.nav>
      )}
    </div>
  );
}
