'use client';

import { m } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { DemoFrame } from './Demo';
import ScaledFrame from './ScaledFrame';
import { Cta, EASE } from './motion';
import { WAITLIST_URL } from './links';

const enter = (delay: number) => ({
  initial: { opacity: 0, y: 28, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.8, ease: EASE, delay },
});
const d = (s: number) => ({ '--d': `${s}s` }) as React.CSSProperties;

// Dark ground, editorial headline, and the real interface rising out of the bottom edge. On
// wide screens the frame runs off the right of the viewport and across the seam into the next
// section, so the product is the first thing the page is built around.
export default function Hero() {
  return (
    <section className="lp-spot relative z-10 overflow-x-clip px-4 pt-32 md:px-8 md:pt-36 xl:pb-px">
      <div className="mx-auto max-w-7xl">
        {/* The copy rises in with a CSS animation (.lp-rise): it is in the server HTML, plays before
            any JavaScript runs, and is simply visible when motion is reduced or scripts are off. */}
        <p className="lp-rise text-sm font-medium text-primary-fixed">Outbound reporting for cold email agencies and GTM teams · Private beta</p>
        <h1 style={d(0.05)} className="lp-rise lp-display mt-5 max-w-5xl pb-2 text-white xl:text-[clamp(3.5rem,6.4vw,6.25rem)]">
          See every client&apos;s outbound <em className="text-primary-fixed">in one place.</em>
        </h1>

        <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-12 lg:items-end">
          <p style={d(0.18)} className="lp-rise lp-lede max-w-xl text-white/75 lg:col-span-6">
            Campaign performance, replies, sending health and client reports for every client, together in one dashboard. <strong className="font-medium text-white">Works with Instantly.</strong>
          </p>
          <div style={d(0.28)} className="lp-rise lg:col-span-5 lg:col-start-8">
            <div className="flex flex-wrap items-center gap-3">
              <Cta href={WAITLIST_URL} variant="mint" large>
                Join the waitlist <ArrowRight size={16} aria-hidden="true" />
              </Cta>
              <Cta href="#tour" variant="line" large>
                See the product
              </Cta>
            </div>
            <p className="mt-4 text-sm text-white/65">Data syncs periodically, not in real time. The last sync time is always shown.</p>
          </div>
        </div>

        <m.div {...enter(0.4)} data-reveal style={{ transformOrigin: '50% 0%' }} className="relative mt-12 min-w-0 pb-12 xl:mt-14 xl:mb-[-300px] xl:pb-0 xl:mr-[calc(50%-50vw)]">
          <p className="mb-3 text-xs text-white/60">Klaroh Overview, shown with sample campaign data.</p>
          {/* Wide screens: the full desktop layout, scaled up and running off the viewport edge. */}
          <div className="hidden xl:block">
            <ScaledFrame width={1180} height={700} overshoot={1}>
              <DemoFrame interactive={false} size="hero" />
            </ScaledFrame>
          </div>
          {/* Below xl: the app at its natural, readable size, cropped with a fade into the ground. */}
          <div className="relative max-h-[540px] overflow-hidden xl:hidden">
            <DemoFrame interactive={false} size="hero" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#04251A] to-transparent" aria-hidden="true" />
          </div>
        </m.div>
      </div>
    </section>
  );
}
