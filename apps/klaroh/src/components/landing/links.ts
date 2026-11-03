// Where every "Join the waitlist" button goes. NEXT_PUBLIC_TALLY_FORM_URL overrides the default
// (for example to point a preview deployment at a test form); anything that is not an https
// tally.so link is ignored.
const DEFAULT_WAITLIST_URL = 'https://tally.so/r/ODpG0M';

function resolve(raw?: string): string {
  try {
    const u = new URL(raw ?? '');
    return u.protocol === 'https:' && u.hostname === 'tally.so' ? u.toString() : DEFAULT_WAITLIST_URL;
  } catch {
    return DEFAULT_WAITLIST_URL;
  }
}

export const WAITLIST_URL = resolve(process.env.NEXT_PUBLIC_TALLY_FORM_URL);
