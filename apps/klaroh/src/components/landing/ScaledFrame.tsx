'use client';

// Renders children at a fixed desktop width and scales them to fit the container, so the hero
// shows the whole app layout (not a squeezed, truncated one) at any column width. `overshoot`
// scales slightly past the container so the frame runs off the edge (the hero bleeds it off
// the viewport); `max` caps the scale on very wide screens.

import { useEffect, useRef, useState } from 'react';

export default function ScaledFrame({ width, height, overshoot = 1, max = 1.35, children }: { width: number; height: number; overshoot?: number; max?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.9);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.min(max, (el.clientWidth * overshoot) / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, overshoot, max]);

  return (
    <div ref={ref} className="w-full overflow-clip [overflow-clip-margin:160px]" style={{ height: height * scale }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}
