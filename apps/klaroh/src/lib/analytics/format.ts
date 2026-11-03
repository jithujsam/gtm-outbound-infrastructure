// Safe arithmetic and display formatting for analytics. Pure and client-safe.
// Nothing here can produce NaN, Infinity or a negative count.

/** numerator / denominator, or null when either is unknown or the denominator is not positive. */
export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator < 0) return null;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : null;
}

/** ratio × 100 */
export function pct(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  const r = ratio(numerator, denominator);
  return r === null ? null : r * 100;
}

/** Per-1,000 rate (e.g. opportunities per 1,000 emails). */
export function per1k(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  const r = ratio(numerator, denominator);
  return r === null ? null : r * 1000;
}

export const DASH = '—';

/** 1,284 / 12.9K / 4.2M — compact for KPI tiles. */
export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  if (abs < 10_000) return Math.round(v).toLocaleString('en-US');
  if (abs < 1_000_000) return `${(v / 1000).toFixed(abs < 100_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Full count with separators (tables). */
export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString('en-US');
}

/** Percentage with adaptive precision: 0.75%, 5.6%, 42%. */
export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  if (v === 0) return '0%';
  if (Math.abs(v) < 1) return `${v.toFixed(2)}%`;
  if (Math.abs(v) < 10) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  if (abs >= 100_000) return `$${fmtCompact(v)}`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: abs < 100 ? 2 : 0 })}`;
}

export function fmtDecimal(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toFixed(digits).replace(/\.0+$/, '');
}

/** "1 : 169" style ratio, or — . */
export function fmtOneIn(numerator: number | null | undefined, denominator: number | null | undefined): string {
  const r = ratio(denominator, numerator);
  return r === null ? DASH : `1 : ${Math.round(r).toLocaleString('en-US')}`;
}

export function fmtDay(day: string | null | undefined): string {
  if (!day) return DASH;
  const t = Date.parse(day.length === 10 ? `${day}T00:00:00Z` : day);
  if (Number.isNaN(t)) return DASH;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** An amount in an explicit ISO 4217 currency (never assumed, never converted): $1,500 · €1,500 · ₹125,000. */
export function fmtCurrency(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const digits = Math.abs(v) < 100 && !Number.isInteger(v) ? 2 : 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
  }
}
