// Prospect replies (the Inbox): what a conversation is, which ones matter, and
// how they are described. Pure and client-safe.
//
// "Positive" here is the SAME definition as the positive metric
// (metrics.ts → METRICS.positive): a lead whose status at the provider is
// interested, meeting booked, meeting completed or won. A reply alone is never
// positive, and an automatic reply is never a human reply.
//
// The Inbox lists conversations; it never produces a headline count. Headline
// numbers (replies, positive responses) come only from the metric layer —
// conversations exist only for replies Klaroh has synced, so their number can
// differ (a lead can be marked positive after a call, without an email reply).

import type { LeadInterest } from '../providers/types.ts';

/** Exactly the lead statuses METRICS.positive counts. */
export const POSITIVE_INTEREST: readonly LeadInterest[] = ['interested', 'meeting_booked', 'meeting_completed', 'won'];

export const isPositiveInterest = (i: LeadInterest | null | undefined): boolean => !!i && POSITIVE_INTEREST.includes(i);

/** How a status is shown (to the agency and, for positive ones, to the client). */
export const INTEREST_LABEL: Record<LeadInterest, string> = {
  interested: 'Interested',
  meeting_booked: 'Meeting booked',
  meeting_completed: 'Meeting completed',
  won: 'Won',
  out_of_office: 'Out of office',
  not_interested: 'Not interested',
  wrong_person: 'Wrong person',
  lost: 'Lost',
};

/**
 * The client's words for the positive statuses: "Positive response" is the
 * portal's own term (its headline metric), never Instantly's "interested".
 */
export const CLIENT_INTEREST_LABEL: Partial<Record<LeadInterest, string>> = {
  interested: 'Positive response',
  meeting_booked: 'Meeting booked',
  meeting_completed: 'Meeting completed',
  won: 'Won',
};

export type InterestTone = 'good' | 'neutral' | 'warning';
export function interestTone(i: LeadInterest | null): InterestTone {
  if (isPositiveInterest(i)) return 'good';
  if (i === 'not_interested' || i === 'wrong_person' || i === 'lost') return 'warning';
  return 'neutral';
}

export interface ThreadSummary {
  id: string;
  campaignId: string;
  campaignName: string;
  leadName: string | null;
  leadCompany: string | null;
  leadEmail: string | null;
  interest: LeadInterest | null;
  subject: string | null;
  humanReplies: number;
  autoReplies: number;
  lastHumanReplyAt: string | null;
  lastReplyAt: string | null;
  snippet: string | null;
}

export type InboxFilter = 'positive' | 'human';
export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'positive', label: 'Positive' },
  { key: 'human', label: 'All human replies' },
];

export function parseInboxFilter(v: unknown): InboxFilter {
  return v === 'human' ? 'human' : 'positive';
}

/** Threads with at least one human reply, newest first; positive ones only for 'positive'. */
export function filterThreads(threads: ThreadSummary[], filter: InboxFilter): ThreadSummary[] {
  return threads
    .filter((t) => t.humanReplies > 0 && (filter === 'human' || isPositiveInterest(t.interest)))
    .sort((a, b) => (b.lastHumanReplyAt ?? '').localeCompare(a.lastHumanReplyAt ?? ''));
}

/** Who wrote: the prospect's name, else their address, else a neutral word. */
export function prospectLabel(t: Pick<ThreadSummary, 'leadName' | 'leadEmail'>): string {
  return t.leadName?.trim() || t.leadEmail || 'Prospect';
}

/** The company, or the email domain when the company is not known (never a free-mail domain). */
const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|gmx|web)\./i;
export function companyLabel(t: Pick<ThreadSummary, 'leadCompany' | 'leadEmail'>): string | null {
  if (t.leadCompany?.trim()) return t.leadCompany.trim();
  const domain = t.leadEmail?.split('@')[1];
  return domain && !FREE_MAIL.test(domain) ? domain : null;
}

// ── states ──────────────────────────────────────────────────────────────────

export interface ReplySyncInfo {
  /** A reply sync has ever run for this scope. */
  everSynced: boolean;
  /** One is running now. */
  syncing: boolean;
  /** Completion time of the newest successful reply sync. */
  lastSuccessAt: string | null;
  /** The newest finished reply sync failed or was incomplete. */
  lastFailed: boolean;
  /** User-safe reason of that failure. */
  lastError: string | null;
  /** Older replies are still being fetched (rate-limited backlog). */
  backlog: boolean;
}

export type InboxEmptyState = 'never_synced' | 'syncing_first' | 'no_replies' | 'only_auto' | 'no_positive' | 'no_match' | null;

/**
 * Which empty state a list shows (null = there are conversations to show).
 * `all` is every stored thread in scope; `shown` what the filter leaves.
 */
export function emptyState(all: ThreadSummary[], shown: ThreadSummary[], filter: InboxFilter, sync: ReplySyncInfo): InboxEmptyState {
  if (shown.length > 0) return null;
  if (all.length === 0) {
    if (!sync.everSynced) return sync.syncing ? 'syncing_first' : 'never_synced';
    return 'no_replies';
  }
  if (all.every((t) => t.humanReplies === 0)) return 'only_auto';
  if (filter === 'positive') return 'no_positive';
  return 'no_match';
}

export const EMPTY_TEXT: Record<Exclude<InboxEmptyState, null>, { title: string; body: string }> = {
  never_synced: {
    title: 'Reply data hasn’t been synced yet',
    body: 'Sync replies to bring in the conversations prospects have started with your campaigns.',
  },
  syncing_first: {
    title: 'Bringing in replies…',
    body: 'The first reply sync is running. Conversations appear here as soon as it finishes.',
  },
  no_replies: {
    title: 'No replies yet',
    body: 'None of the prospects have replied so far. New conversations will appear here as they arrive.',
  },
  only_auto: {
    title: 'No meaningful replies yet',
    body: 'So far only automatic responses (such as out-of-office messages) have come in. Real conversations will appear here.',
  },
  no_positive: {
    title: 'No positive replies yet',
    body: 'Your campaigns haven’t generated a positive response yet. New conversations will appear here as they arrive.',
  },
  no_match: {
    title: 'No conversations here',
    body: 'No conversations match this view.',
  },
};
