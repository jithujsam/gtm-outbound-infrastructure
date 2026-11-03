/**
 * Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago",
 * falling back to a short date for anything older than a week. No dependencies.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (sec < 45) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;

  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Absolute timestamp shown alongside the relative one. */
export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
