// Reply activity over time, from the timestamps of synced prospect replies
// (reply_messages.sent_at). Pure and client-safe.
//
// These are real events, not snapshots: a day with no synced reply is a 0,
// counted from the first day of the window that has data up to today. The
// figure is "replies Klaroh has synced", not the human-replies metric (which
// counts unique prospects per campaign as reported by the provider), so the
// two can differ and are never presented as the same number.

/** Reply activity covers at most this many days, including today (the reply sync reads 90 days back). */
export const REPLY_ACTIVITY_DAYS = 90;

export interface DayCount {
  /** YYYY-MM-DD (UTC) */
  date: string;
  value: number;
}

const DAY = 86_400_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Replies per UTC day, from the first day with a reply (inside the window)
 * through `today`. Empty when there is no reply in the window.
 */
export function repliesByDay(sentAt: string[], today: string, days = REPLY_ACTIVITY_DAYS): DayCount[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(end)) return [];
  const start = end - (days - 1) * DAY;
  const counts = new Map<string, number>();
  for (const s of sentAt) {
    const t = Date.parse(s);
    if (!Number.isFinite(t)) continue;
    const d = day(t);
    const dt = Date.parse(`${d}T00:00:00Z`);
    if (dt < start || dt > end) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  if (!counts.size) return [];
  const first = Date.parse(`${[...counts.keys()].sort()[0]}T00:00:00Z`);
  const out: DayCount[] = [];
  for (let t = first; t <= end; t += DAY) out.push({ date: day(t), value: counts.get(day(t)) ?? 0 });
  return out;
}
