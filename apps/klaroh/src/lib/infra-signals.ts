// The client's infrastructure figures that the agency types into Klaroh
// (clients.sending_capacity, active_inboxes, domain_health_score,
// domain_health_status). They are never synced from a sending platform, so
// every place that shows them says so. Pure and client-safe.

/** Short marker shown next to a manually entered figure. */
export const MANUAL_LABEL = 'Entered by your team';

/** Tooltip / help text for a manually entered figure. */
export const MANUAL_HELP = 'Entered by your team in Klaroh. Not synced from the sending platform.';

/**
 * The domain health text to show, or null when there is nothing to show.
 * A status label is only shown together with a score: on its own it is not
 * evidence of anything (new clients get the status "Healthy" by default).
 */
export function domainHealthText(score: number | null | undefined, status: string | null | undefined): string | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const label = typeof status === 'string' ? status.trim() : '';
  return label ? `${score}% · ${label}` : `${score}%`;
}
