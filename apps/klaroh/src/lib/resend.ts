import { Resend } from 'resend';

let client: Resend | null = null;

/**
 * Lazily constructs the Resend client so a missing key fails the individual
 * send (which is logged to email_logs) instead of crashing module import,
 * builds and unrelated routes.
 */
export function getResend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY environment variable is not set');
    client = new Resend(key);
  }
  return client;
}
