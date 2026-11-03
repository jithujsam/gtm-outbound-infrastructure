# Landing page: claims and settings the owner must verify before launch

The landing page copy was refined to describe Klaroh as a visibility layer over a sending tool (today, Instantly), not a tool that runs campaigns. This list is what still needs a person to confirm. Nothing here has been verified against production, the live Tally form or the live Vercel project.

## Privacy section (removed from the page)

The inline Privacy section, its footer link and the "Privacy" link under the waitlist form were removed at the owner's request, because the block looked out of place. **The page now collects emails through the Tally form with no privacy notice on it.** Decide where a privacy notice will live (a separate page, or Tally's own form footer) before launch. The statements that were on the page are kept below as a checklist for whatever replaces them. Each needs the owner to confirm it is true, or to rewrite it:

| Statement in the page | What to confirm |
|---|---|
| "Last updated: October 2026" | Date is accurate when published |
| "This page is run by Klaroh" / contact `hello@klaroh.app` | Legal entity name, and that the mailbox exists and is monitored |
| Collects "email address, company name, and your answer to whether you would be comfortable sharing an Instantly API key" | The Tally form's real fields match exactly |
| "We never ask for an API key through the form" | No Tally field accepts a key |
| "to invite agencies in the order they joined" | Still how access is actually granted. The hero, Join section and FAQ no longer promise this |
| "We do not sell your data and do not use it for unrelated marketing" | A commitment the business will keep |
| "The form is provided by Tally… stores your answers on our behalf" | Tally account, workspace region and data-processing terms |
| "This site is hosted by Vercel" | True for the production deployment |
| "this page sets no tracking cookies of its own" | No analytics or cookie-setting scripts added |
| "If we have not been in touch within 12 months, we delete the entry" | A retention period the owner has chosen, and a process to delete |
| "ask to see, correct or delete your data… we will act promptly" | Someone owns these requests and a response time is decided |

## New content (added with the beta offer and plans)

| Statement on the page | What to confirm |
|---|---|
| "working with a small group of beta users and will open access in stages over the next couple of months" | The timeline is one you will keep |
| "we will send you an invitation link when your access is ready" | You will send it, and how (the page promises no signup confirmation email, only this later invitation) |
| "Beta members get a discounted price for their first 3 months" | The offer is real. No percentage is shown |
| "Prices are shared with your invitation" (FAQ) | You will share prices at invitation. The plan tiers (1, 5, 10, 20 to 30 clients) were taken off the page. If they return, note they do not match `src/lib/plan-limits.ts` (solo 3, growth 10, agency 20, pro 25) or the billing page ($29 / $79 / $149) |
| "See more than campaign counts" tile (fixed metric definitions, replies without auto-replies, results by step, cost per positive from the cost you enter) | The product does these (checked against the earlier audit and code names, not re-tested). The page does not claim to show more than Instantly's own UI, because that comparison was not verified |
| "Watch your sending setup" tile (mailbox status, warmup scores, SPF, DKIM, DMARC, MX) | Matches what Instantly reports for your accounts |

## Claims removed from the page

Removed because they could not be verified: "Takes under a minute", "Invited in the order you apply", "We are opening a small beta" (implied limited capacity). Add them back only if true.

## Claims kept, with what was and was not verified

| Claim | Verified | Not verified |
|---|---|---|
| Instantly API key is validated, then encrypted (How step 1, FAQ) | In code: the key is validated with the provider before saving (`src/app/api/integrations/route.ts`), encrypted with AES-256-GCM (`src/lib/encryption.ts`, `src/lib/data/integration-secrets.ts`), and the encrypted column is excluded from client-side reads | That `ENCRYPTION_KEY` is set to a strong value in production |
| "Needs attention" shows provider-reported states | In code: `src/lib/analytics/attention.ts` builds the list only from states the provider reports. It is a list shown when a user opens Overview, not a push alert | Production data |
| Mailbox status, warmup scores, domain DNS checks | Exist in the product per `docs/landing-page-audit.md` | What each shows depends on what Instantly reports. Not re-tested |
| Each client gets a private link; the agency chooses what they see; the link can be rotated | A rotate route exists (`/api/client-portal/rotate`) | End-to-end behaviour not re-tested |
| "Replies, without auto-replies" (Honesty section) | An auto-reply filter exists (`isAutoReplyMessage`, `src/lib/providers/instantly/normalize.ts`) | Accuracy of the filter |
| Data syncs periodically and shows the last sync time | Documented in `docs/landing-page-audit.md` (daily cron plus on-open sync) | Not re-tested |
| "Why ask about API keys?" FAQ answer | Matches the privacy text | That the Tally form actually asks the question |

## Launch settings and tests (not done by this change)

1. **Tally form.** Every "Join the waitlist" button now opens `https://tally.so/r/ODpG0M` in the same tab; the form is no longer embedded, and `tally.so` was removed from the Content-Security-Policy `frame-src`. `NEXT_PUBLIC_TALLY_FORM_URL` overrides the link if set (only https `tally.so` links are accepted). This sandbox cannot reach tally.so, so the form was not opened or tested. On the live form, check the thank-you message and that no respondent email is sent.
2. **Form title.** The page now shows "Join the waitlist" above the form (the Tally title is hidden). Make sure the form's own copy is consistent.
3. **Submit a real test entry** on the deployed page. Confirm the on-page confirmation says what happens next, that no confirmation email is sent to the respondent (check Tally's respondent-notification setting), and that the form works at 390px and 768px.
4. **`NEXT_PUBLIC_SITE_URL`.** Set it to the production origin. If neither it nor `VERCEL_PROJECT_PRODUCTION_URL` is set, `metadataBase`, the canonical URL and `og:url` fall back to `http://localhost:3000`.
5. **Production Supabase env.** `src/proxy.ts` skips authentication when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing (existing behaviour). With them set, dashboard routes redirect to sign-in. Confirm both are set in production.
6. **Social-sharing image.** Not created yet. Twitter/X uses the plain `summary` card until one exists. Add `opengraph-image` and switch to `summary_large_image`.
7. **Lighthouse and a production smoke test** on the deployed URL (not run here).
