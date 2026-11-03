import { timingSafeEqual } from 'node:crypto';

/**
 * Validates the `Authorization` header of a scheduled-job request.
 *
 * Fails closed: if `CRON_SECRET` is unset or empty the request is rejected,
 * so a missing env var can never turn into `Bearer undefined` being accepted.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!secret || secret.length === 0) return false;
  if (!authorizationHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorizationHeader);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
