'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** day: "8 Oct" · dateTime: "8 Oct 2026, 8:51 PM" · dateTimeShort: the year only when it isn't this year. */
type Format = 'day' | 'dateTime' | 'dateTimeShort';

function format(iso: string, f: Format, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (f === 'day') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone });
  const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone });
  const withYear = f === 'dateTime' || year(d) !== year(new Date());
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' as const } : {}), timeZone })}, ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}`;
}

/**
 * A timestamp in the VIEWER's time zone. The server renders UTC (marked as
 * such in the title); the browser replaces it after hydration, so the two
 * renders never disagree.
 */
export default function LocalTime({ iso, format: f = 'day', className }: { iso: string; format?: Format; className?: string }) {
  const local = useSyncExternalStore(noop, () => true, () => false);
  return (
    <time dateTime={iso} className={className} title={new Date(iso).toUTCString()}>
      {format(iso, f, local ? undefined : 'UTC')}
    </time>
  );
}
