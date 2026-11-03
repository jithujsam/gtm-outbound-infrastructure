# Landing Page Implementation Plan — Klaroh

> **Update (build decision):** the owner chose **Tally** for the waitlist (email, company name, and an "are you comfortable sharing an API key?" question), so there is **no waitlist table, API route, rate limiter or migration**. The sections of this document about those are superseded. The landing page was built as a single static page with a Tally embed (`NEXT_PUBLIC_TALLY_FORM_URL`). Routing findings (proxy, root layout) were implemented as described.


**Status:** Plan only. Nothing here is implemented, no migration has been created or applied, no package installed, no production setting changed. This document does not say the site is ready to deploy.
**Companion docs:** `landing-page-audit.md` (evidence, claim guardrails, open decisions), `landing-page-design.md` (design, copy, animation).
**Labels:** **[V]** verified in repo · **[R]** recommendation · **[?]** needs the owner's decision.

---

## 0. Gates before any code is written

1. Owner answers the decisions in audit §8 ("Must resolve"): meaning of "access" (open signup vs. invite-only), onboarding capacity, privacy/terms content, approval of the waitlist migration, the "500+ agencies" claim, production domain and `hello@klaroh.app`.
2. Run `npm install` and **read the relevant guides in `node_modules/next/dist/docs/`** as `AGENTS.md` requires: `proxy` file convention, root layouts and dynamic rendering via `cookies()`, route handlers, metadata files (`robots`, `sitemap`, `opengraph-image`). This repo is on Next 16.2.7 **[V]**; the audit could not read those docs. Adjust this plan where they differ.
3. Re-inspect the reference site (`outfound.io`) in a browser; the audit could only use a search summary.

---

## 1. Proposed files and routes

### 1.1 New

| Path | Purpose |
|---|---|
| `src/app/page.tsx` | **Replace** the redirect with the static landing page (server component). No `force-dynamic`, no `getUser()` |
| `src/components/landing/Header.tsx` | Sticky header + mobile disclosure menu (client) |
| `src/components/landing/Hero.tsx` | Hero copy + compact form + product frame |
| `src/components/landing/ProductTour.tsx` | Tabbed sample-data tour (client; ARIA tabs) |
| `src/components/landing/sample-data.ts` | Fictitious, internally consistent sample numbers, typed, with a "sample" constant |
| `src/components/landing/Pillars.tsx`, `HonestyPanel.tsx`, `HowItWorks.tsx`, `EarlyAccess.tsx`, `Faq.tsx`, `FinalCta.tsx`, `Footer.tsx` | Sections (server components unless motion needed) |
| `src/components/landing/WaitlistForm.tsx` | Client form with all states (§2.6) |
| `src/components/landing/motion.tsx` | `MotionConfig` wrapper, shared variants/tokens from design §7.2, `Reveal` helper |
| `src/lib/waitlist.ts` | **Pure** validation/normalisation (no `@/` imports, relative `.ts` imports only, so `node --test` can load it, matching `metrics.ts` convention **[V]**) |
| `src/lib/__tests__/waitlist.test.ts` | Unit tests for the above |
| `src/app/api/waitlist/route.ts` | `POST` handler (§2.4) |
| `src/app/privacy/page.tsx` (+ `terms/page.tsx` if wanted) | **Only after** the owner supplies content; static, public |
| `src/app/robots.ts`, `src/app/sitemap.ts` | Index `/` (+ legal pages); disallow `/api/`, `/c/`, `/dashboard`, `/clients`, `/campaigns`, `/inbox`, `/infrastructure`, `/settings`, `/auth/` |
| `src/app/opengraph-image.*` | Share image **[?]** design needed |
| `supabase/migrations/<ts>_waitlist.sql` | New table (§2.1). Timestamp after `20261008000400` |
| `supabase/manual-apply/v2/19_waitlist_1of1.sql` | Per project convention for the production DB **[V]** `supabase/README.md` |
| `supabase/tests/waitlist.test.sql` | DB test wired into `supabase/tests/run.sh` (security + uniqueness) |
| `supabase/verify/waitlist_check.sql` | Read-only post-apply check, like the existing `*_check.sql` files |

### 1.2 Modified

| Path | Change |
|---|---|
| `src/app/layout.tsx` | Remove the `cookies()` read and `SidebarProvider` (makes the root layout static). Update `metadata` (title template, description, `metadataBase`, `openGraph`, `robots`). Keep fonts and `<body>` classes |
| `src/app/(dashboard)/layout.tsx` | Make it `async`; read `klaroh_sidebar_collapsed` here and wrap `<DashboardLayout>` in `SidebarProvider`. Safe because `useSidebar` is used only by `DashboardLayout.tsx` and `clients/dashboard-layout.tsx`, both inside this group **[V]** |
| `src/proxy.ts` | Exact-match public allow-list (§3) |
| `src/lib/rate-limit.ts` | Add an optional fail-closed mode (default unchanged) |
| `src/app/globals.css` | Only if a landing-only utility is genuinely needed; prefer Tailwind arbitrary values in the components |
| `src/components/AuthBranding.tsx` | Remove/replace the unverified "Trusted by 500+…" line (owner decision) |
| `README.md`, `docs/PRODUCT-BIBLE.md` | Out of scope here, but they are stale (audit §1); refresh after launch |

### 1.3 Not touched

`/c/*` portal routes and handling, `/api/*` existing routes, auth pages, dashboard pages, `vercel.json` cron, existing migrations, package manifests.

### 1.4 Route behaviour

| URL | Signed-out | Signed-in |
|---|---|---|
| `/` | Landing page (static) | Redirect to `/dashboard` (preserves today's behaviour) **[R]** |
| `/auth/*` | unchanged | unchanged (redirect to `/dashboard`) |
| `/c/*` | unchanged (public, token-gated, noindex) | unchanged |
| `/api/waitlist` | public POST | public POST |
| `/privacy`, `/terms` (if created) | public | public |
| everything else | redirect to `/auth/login` | unchanged |

---

## 2. Waitlist backend plan

### 2.1 Table (proposal — not created)

```sql
-- PROPOSAL ONLY. Not a migration file; for owner review.
create table public.waitlist_signups (
  id                bigint generated always as identity primary key,
  email             text not null check (char_length(email) between 3 and 254),
  email_normalized  text generated always as (lower(btrim(email))) stored,
  created_at        timestamptz not null default now(),
  notice_version    text not null,            -- which privacy notice text was shown
  source            text,                     -- e.g. 'hero' | 'early-access' | 'footer' (allow-listed)
  invited_at        timestamptz               -- set by the owner when an invitation is sent
);

alter table public.waitlist_signups
  add constraint waitlist_signups_email_normalized_key unique (email_normalized);

alter table public.waitlist_signups enable row level security;
-- No policies: nobody but the service role can read or write.
revoke all on public.waitlist_signups from anon, authenticated;
```

Design notes:

- **Order:** `id` (identity) is monotonic; `created_at` records the moment. Order by `id`, tie-break by `created_at`. Identity values can have gaps, so they are internal only and **never shown as a position** **[V]**/[R] reasoning in audit §7.
- **Duplicates:** unique constraint on the normalised address. Insert with `on conflict (email_normalized) do nothing` so the original row, and therefore the original place in line, is never altered. (With supabase-js: `.upsert(row, { onConflict: 'email_normalized', ignoreDuplicates: true })`; confirm the generated-column conflict target works in PostgREST during the DB test **[?]**.)
- **No IP or user-agent stored.** Less personal data, simpler privacy notice. Abuse control uses the existing rate-limit table instead.
- **No RLS policies and revoked privileges** keeps the table non-public even if the anon key (shipped to browsers **[V]**) is used directly. The database test must prove an `anon` and an `authenticated` role cannot `select`/`insert` (mirror `supabase/tests/security.test.sql`).
- **Local-part case:** lower-casing the whole address is standard practice and matches how nearly all providers behave; the original-case `email` is preserved for display.
- **Alternatives rejected:** a Google Sheet/Form or third-party list tool (new external service, data leaves the stack — not necessary); Supabase Auth `signUp` (creates real accounts and sends auth email); `email_logs` (wrong purpose, stores bodies).
- **Capacity:** at waitlist scale this table is trivial; no extra indexes beyond the unique constraint.

### 2.2 Migration process

Follow the project's convention **[V]**: file in `supabase/migrations/`, mirrored under `supabase/manual-apply/v2/`, add a DB test and a `verify` script, document it in `supabase/README.md`. It is additive, so it is safe to apply before deploying the app code; the route should degrade to a friendly error if the table is missing. The owner applies it to production manually, as with previous parts **[V]**. **[?]** Which Supabase project do Vercel Preview deployments use? If production, preview testing would write real rows; use a separate project or test with a clearly marked email domain and delete afterwards.

### 2.3 Validation (`src/lib/waitlist.ts`, pure)

- `normaliseEmail(input: unknown): string | null` — must be a string; `trim`; ≤ 254 chars; exactly one `@`; local part 1–64 chars; domain with at least one dot, labels 1–63 chars of letters/digits/hyphen (no leading/trailing hyphen), TLD ≥ 2; no whitespace or control characters; reject obvious invalid forms (`..`, leading/trailing dot). Do not attempt full RFC 5322.
- `parseSource(input: unknown)` — only values from a fixed allow-list; otherwise `null`.
- `NOTICE_VERSION` constant, bumped when privacy text changes.
- **No disposable-domain blocklist and no MX lookup in v1** (maintenance burden and false positives; revisit if abuse appears).

### 2.4 Route handler `POST /api/waitlist`

Runs on Node runtime (admin client + `node:crypto` free). Sequence:

1. **Content-Type and size:** require `application/json`; read at most ~2 KB; otherwise 400/413.
2. **Origin check:** if `Origin` is present it must match the site host (allow-list from env/`metadataBase`); otherwise 403. (There are no cookies/sessions on this route, so classic CSRF is moot, but this stops cross-site form farms from browsers.)
3. **Honeypot:** a field such as `company_website`; if non-empty, return the normal success response without writing. Also optionally reject submissions arriving < ~1.5s after form render (client sends `elapsedMs`; treat as a soft signal, not a hard block, so assistive tech and password managers aren't penalised).
4. **Rate limit** via existing `checkRateLimit` **[V]**, in the style of `onboard:${ip}`:
   - per IP: `waitlist:ip:<hashedIp>` — 5 / hour (+ optional 20 / day)
   - global brake: `waitlist:global` — e.g. 300 / hour
   - **Fail-closed:** unlike current callers, `checkRateLimit` fails *open* on error **[V]**. Add a `failClosed` option so a database outage rejects instead of allowing unlimited inserts.
   - Hash the IP (SHA-256 with a server-side salt) before using it in the key, so raw addresses aren't added to `rate_limits` (existing keys store raw IPs **[V]**). New env var `WAITLIST_HASH_SALT` **[?]** or reuse an existing secret by deriving; prefer a dedicated one.
   - `clientIp()` trusts the first `x-forwarded-for` entry **[V]**; on Vercel the platform sets it, but confirm behaviour for the deployment **[?]**.
5. **Validate** email and `source`. Invalid → `400 { error: 'invalid_email' }`.
6. **Insert** through `createAdminClient()` with `on conflict do nothing`.
7. **Respond:** always `200 { ok: true }` for both a new signup and a duplicate (no enumeration, no position, no count). Errors: `429 { error: 'rate_limited' }`, `500 { error: 'server_error' }` (generic). Never echo database errors. `Cache-Control: no-store`.
8. **Logging:** `console.error` operational failures **without the email address**.

Not in v1: confirmation email, double opt-in, owner-notification email (see §2.7).

### 2.5 Privacy and consent

- Collected: email address and the timestamp of signup; the privacy notice version shown. Nothing else is stored in the table.
- Purpose limitation stated in the form microcopy (copy in design doc §8–9).
- A real **Privacy notice** page must exist before the form goes live: controller identity, contact, purpose (contact about access), retention (e.g. deleted or anonymised after N months, **[?]**), processors (Supabase, Vercel), rights and how to exercise them (email), region **[?]**. I am not providing final legal text; **[?]** owner/counsel to supply it.
- Unsubscribe/removal path: reply to any email or write to `hello@klaroh.app` (**[?]** confirm mailbox is monitored); owner deletes the row manually (§2.8).
- If counsel wants affirmative consent, add an unchecked required checkbox and store `notice_version` alongside (field already present).
- Do not add third-party trackers or cookies; with none, no cookie banner is required for the landing page **[?]** (confirm with counsel for the target regions).

### 2.6 Client form (`WaitlistForm.tsx`)

- Controlled input, client validation (design §9), `fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })` — same-origin, allowed by the CSP `connect-src 'self'` **[V]**.
- States: idle · error · submitting · success · rate-limited · server-error (strings in design §9).
- Prevent double-submit (disabled while pending). Abort the request on unmount.
- After success set a `sessionStorage` flag (wrapped in try/catch) so other form instances show the confirmation. The page must work if storage is unavailable.
- Reuse `Field`, `FormError`, `.btn`, `.input`, `Loader2` **[V]**.

### 2.7 Emails: deliberately deferred

- Confirmation emails need a verified Resend domain; with the sandbox sender they will not reach arbitrary recipients **[?: confirm the current Resend domain status]**.
- Sending mail to unverified addresses lets the endpoint be used to mail-bomb third parties. With **no** email sent, the endpoint can't be abused that way. That is the main reason to skip it.
- Cost of skipping: typos and fake emails can enter the list. Mitigation: when inviting, send a normal "your access is ready" email and treat bounces as removals.
- If the owner later wants a confirmation or owner-notification email, extend `sendEmail` (its `email_type` is a closed union **[V]** and `email_logs` may have a CHECK **[?: inspect]**), verify the domain, and add double opt-in. Not needed for the first-come-first-served promise.

### 2.8 Owner operations (retrieval)

No admin UI. Use the Supabase dashboard (the table is service-role only):

```sql
-- Current order of the list
select id, email, created_at, invited_at
from public.waitlist_signups
order by id;

-- Next batch to invite
select id, email from public.waitlist_signups
where invited_at is null
order by id
limit 10;

-- Mark invited
update public.waitlist_signups set invited_at = now() where id = any (array[...]);

-- Remove on request
delete from public.waitlist_signups where email_normalized = lower(btrim('person@example.com'));
```

CSV export: Table Editor → export, or run the query in the SQL editor and download. Document this in `supabase/README.md` after the migration lands. **[?]** Whether the owner wants a daily digest or a Slack/email ping per signup (not recommended for v1).

---

## 3. Making `/` public safely

Current behaviour **[V]**: `src/proxy.ts` redirects every signed-out request outside `/api/`, `/_next/`, `/c/`, `/auth/` to `/auth/login`, so `/` cannot be public without a proxy change. Also the root layout reads cookies **[V]**.

**Proxy changes [R]:**

1. Define an exact-match set: `PUBLIC_EXACT = new Set(['/', '/privacy', '/terms', '/robots.txt', '/sitemap.xml'])` plus the OG-image route path decided by Next's convention **[?: verify in docs]**. Use **exact** matches, never `startsWith('/')` or broad prefixes.
2. For a public path:
   - If no Supabase auth cookie is present (cookie name begins `sb-` and contains `-auth-token`, possibly chunked) → `NextResponse.next()` immediately, skipping the Supabase call, so landing visitors pay no auth latency.
   - If one is present on `/` → run the existing `getUser()` flow; valid user → redirect `/dashboard`; otherwise continue to the landing page.
   - Legal pages and files: always `next()`.
3. Leave the existing early return for `/api/`, `/_next/`, `/c/` untouched, and keep the fail-closed `catch` for non-public paths **[V]**. For public paths a failure must fail *open to the landing page*, not to the login redirect.
4. Matcher: `.txt`/`.xml` are not in the exclusion list **[V]**, so they reach the proxy; the allow-list above handles them.

**Layout change [R]:** move `cookies()` + `SidebarProvider` from root layout to `(dashboard)/layout.tsx` (§1.2). Then `/` can be statically rendered and cached at the edge.

**Verification:** build output must show `/` as static (○), not dynamic (ƒ) **[?: confirm indicator in Next 16 build output]**. Test that `/dashboard`, `/clients`, `/inbox`, `/settings`, `/campaigns/<id>` still redirect signed-out users, and `/c/<slug>/<token>` is unchanged.

**Secure portal links:** the landing page must contain no `/c/` URLs, no client slugs, no tokens, and must not be able to leak them via Referer (the portal already sets `no-referrer` **[V]**).

---

## 4. Security considerations

| Risk | Mitigation |
|---|---|
| Public write endpoint spam | Per-IP + global rate limits, fail-closed; honeypot; body-size cap; strict validation; no outbound email |
| Email enumeration | Identical response for new and duplicate |
| Data exposure via anon key | RLS on, **no policies**, privileges revoked from `anon`/`authenticated`; DB test proves it |
| Service-role key leakage | Used only in the route handler via `createAdminClient()` **[V]**; never imported in client components |
| Open redirect / CSRF | No redirects or cookies on the route; Origin check |
| Personal data sprawl | Only email + timestamp + notice version; no IP/UA; errors logged without emails |
| Proxy over-exposure | Exact-match allow-list; regression tests for protected routes |
| CSP breakage | Same-origin fetch only; no third-party scripts, fonts or embeds. If analytics are added later, update CSP deliberately |
| Clickjacking / sniffing | Existing headers already set (`X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS) **[V]** |
| Fabricated credibility | Claim guardrails (audit §4); every product visual labelled "Sample data" |
| IP header trust | Verify Vercel's `x-forwarded-for` behaviour; if uncertain, add a coarser global limiter |
| Rate-limit table growth | Keys for one-off IP hashes accumulate; the existing table has no cleanup **[V: none found]**; add a periodic delete or accept at this scale **[?]** |

---

## 5. Vercel deployment requirements

- Flow stays GitHub → Vercel **[V from request]**. Work on a feature branch; Vercel Preview per push; merge to `main` for production **[V: README branch strategy]**.
- **New env vars:** `WAITLIST_HASH_SALT` (server-only) **[R]**; optionally `NEXT_PUBLIC_SITE_URL` for `metadataBase`/sitemap (or derive from a Vercel env). All others already exist: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` **[V]**. Set in Preview *and* Production as appropriate; do not commit values; add the new names to `.env.example`.
- **No changes** to `vercel.json` (cron stays) **[V]**.
- **Database first:** apply the waitlist migration to the target Supabase project *before* the app deploy that depends on it, then run `verify/waitlist_check.sql`. Order matters only for the route; the page will render regardless.
- **Domain:** attach the production domain in Vercel and confirm DNS **[?]**; set canonical URL, `metadataBase`, sitemap host.
- **Preview protection:** Preview deployments may be publicly reachable and indexable; set `robots` to disallow when `VERCEL_ENV !== 'production'` **[R]**.
- **Caching:** landing page should be served static from the edge; `/api/waitlist` is dynamic/no-store.
- **Observability:** check Vercel function logs for `/api/waitlist` 4xx/5xx after launch; no new monitoring service.
- **Rollback:** the page and route are additive; rollback = redeploy previous commit. Proxy/layout changes are the riskiest and should ship in a commit that can be reverted independently **[R]**.

---

## 6. Testing plan

### 6.1 Unit (`npm test`, `node:test`) **[V runner]**
- `normaliseEmail`: valid (`a@b.co`, plus-addressing, subdomains, uppercase), invalid (empty, no `@`, two `@`, spaces, no dot, trailing dot, > 254, local > 64, Unicode control chars, non-string), trimming and lower-casing.
- `parseSource` allow-list.
- Proxy path classifier (extract as a pure function so it can be tested): `/` public, `/privacy` public, `/dashboard` protected, `/c/x/y` bypass, `/api/waitlist` bypass, `/robots.txt` public, lookalikes (`/privacy/../dashboard`, `//`, `/ ` with trailing slash, query strings) behave correctly.

### 6.2 Database (`npm run db:test`) **[V runner]**
- Table exists with expected columns; RLS enabled; no policies.
- `anon` and `authenticated` cannot `select`, `insert`, `update`, `delete` (mirror `security.test.sql`).
- Unique index rejects `A@x.com` vs `a@x.com ` duplicates; first row's `id` and `created_at` unchanged after a conflicting insert.
- Insert order matches `id` order.

### 6.3 Route integration
- Run against a throw-away DB / PostgREST like the existing e2e harness (`supabase/tests/e2e`) **[V exists]**, or a mocked admin client if the harness is too heavy.
- Cases: new → 200; duplicate → 200 with identical body and no new row; invalid → 400; honeypot → 200 and no row; oversized body → 413; wrong content type → 400/415; foreign Origin → 403; 6th request from one IP in an hour → 429; rate-limit RPC error → 429/503 (fail-closed); DB error → 500 generic, no email in logs.

### 6.4 Manual / browser
- Real browsers (Chrome, Safari, Firefox) and a physical phone: hero, tour, form states, mobile menu, FAQ.
- Viewports: 320, 375, 768, 1024, 1440. No horizontal page scroll.
- Signed-out `/` loads landing; signed-in `/` goes to `/dashboard`; all protected routes still redirect; legacy `/c/<slug>` still shows "new link" message; token portal unaffected **[V behaviours]**.
- Keyboard-only walkthrough; screen-reader smoke test (VoiceOver/NVDA); axe/Lighthouse accessibility ≥ 95 with zero serious issues.
- `prefers-reduced-motion: reduce` check: no transforms, no auto-play.
- JavaScript disabled: content readable; form shows a graceful note (or progressive `<form>` fallback **[?]**).
- Performance: Lighthouse mobile — LCP < 2.5s, CLS < 0.1, INP < 200ms on throttled 4G/4× CPU **[R targets, to be measured]**; compare JS payload before/after Motion (`LazyMotion`).
- Dashboard regression pass after moving `SidebarProvider`: sidebar collapse persists across reloads with no first-paint jump; mobile nav; settings modal.
- `npm run typecheck`, `npm run lint` (note existing lint errors are pre-existing **[V README]**; ensure no *new* ones), `npm run build`.
- Preview deploy smoke test before merging.

---

## 7. Acceptance criteria

The work is acceptable only when **all** are true:

**Product truthfulness**
1. Every claim on the page maps to the "safe" list in the audit; none from the "unsafe" list appear (no real-time, AI, open rate, meetings, revenue, customer counts, queue size, unverified compliance, Smartlead as available).
2. Every product visual is labelled "Sample data" and uses fictitious names; numbers are arithmetically consistent.
3. The auth-panel "500+ agencies" line is removed or substantiated.

**Routing and security**
4. Signed-out `/` serves the landing page with no redirect; signed-in `/` redirects to `/dashboard`.
5. All other previously protected routes still redirect signed-out users; `/c/*` and `/api/*` behaviour unchanged.
6. `/` is statically rendered (verified in build output) and the dashboard behaves identically after the layout change.
7. The waitlist table is unreadable and unwritable by `anon` and `authenticated` (test passes).
8. No new package is installed; `framer-motion` 12.40.0 is the only motion library.

**Waitlist**
9. A valid email creates exactly one row with `id`, `created_at`, `notice_version`; a repeat (any case/whitespace) creates no row and leaves the original untouched.
10. The visitor sees the identical success message for new and duplicate signups; no count, position or date is shown.
11. Rate limits, honeypot, size and Origin checks behave as specified, and a rate-limiter outage fails closed.
12. The owner can list the signups in order and mark/delete rows using the documented SQL.
13. A Privacy notice page exists and is linked from the form before launch; contact address works.

**Experience**
14. Layout works from 320px to 1440px with no horizontal page scroll; touch targets ≥ 44px; text ≥ 12px.
15. Animation follows design §7: tokens, once-only scroll reveals, no looping/parallax, `prefers-reduced-motion` honoured; page fully usable with animation disabled.
16. Accessibility: keyboard operable, ARIA tabs correct, form errors/success announced, contrast verified, axe has no serious/critical issues.
17. Performance targets in §6.4 met on a preview deployment, or deviations recorded and accepted.

**Delivery**
18. Preview deployment verified end to end (including a test signup removed afterwards); migration applied and verified in the target Supabase project before production release; env vars set; rollback path noted.

---

## 8. Suggested build order

1. Owner decisions (§0) → privacy notice text → migration approved.
2. `npm install`; read Next 16 docs; confirm assumptions in §3.
3. Layout + proxy change in isolation, with regression checks (smallest risky change).
4. Migration, DB tests, `waitlist.ts` + tests, route + tests.
5. Landing sections and form, then product tour, then animation pass.
6. Accessibility, performance and responsive pass; preview deploy; owner review.
7. Apply migration in production, merge, monitor.
