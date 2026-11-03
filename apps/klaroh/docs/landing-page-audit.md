# Landing Page Audit — Klaroh

> **Update (build decision):** the owner chose **Tally** for the waitlist (email, company name, and an "are you comfortable sharing an API key?" question), so there is **no waitlist table, API route, rate limiter or migration**. The sections of this document about those are superseded. The landing page was built as a single static page with a Tally embed (`NEXT_PUBLIC_TALLY_FORM_URL`). Routing findings (proxy, root layout) were implemented as described.


**Status:** Audit only. No application code, schema, package or production configuration was changed. Nothing here says the site is ready to deploy.
**Repo state audited:** branch `claude/funny-newton-f02o2g`, at `7e8ffb9` (merge of PR #98).
**Method:** static read of the documents and source. `node_modules/` is not installed in this session, so nothing was built or run, and `node_modules/next/dist/docs/` (which `AGENTS.md` says to read before writing code) could not be consulted. That check is a gate before implementation (see §8).

Labels used throughout:

- **[V]** verified in current code or migrations (file cited)
- **[R]** recommendation
- **[?]** unresolved question or assumption that needs the owner's decision

---

## 1. Documents vs. code — discrepancies

`CLAUDE.md` and `docs/design.md` are mostly current. `README.md`, `docs/PRODUCT-BIBLE.md` and `docs/AUDIT.md` are older and conflict with the code in places. Code wins.

| Topic | Document says | Code says | Use |
|---|---|---|---|
| Data provider | PRODUCT-BIBLE: Smartlead + "Demo Data"; Instantly "planned" | Instantly is the only connectable provider; Smartlead is `available: false` ("on the way"). No demo-data mode. `src/lib/providers/catalog.ts` **[V]** | Instantly only |
| Product shape | PRODUCT-BIBLE: 4 stat cards, 4-week leads chart, open rate | Analytics shell: Overview, Campaigns, Inbox, Infrastructure, Clients (`src/components/nav/nav-config.ts`) **[V]** | Code |
| Open rate | PRODUCT-BIBLE and README list it | Withheld as unreliable (`UNAVAILABLE_PORTAL_METRICS` in `src/lib/analytics/portal.ts`) **[V]** | Never advertise open rate |
| Remarks / updates feed | README and PRODUCT-BIBLE: core "Communication" layer | `supabase/README.md`: "the app no longer has remarks"; no remarks route or UI in `src/` **[V]** | Do not advertise |
| Public portal | README: public `/c/[slug]`, no login | Slug-only links are revoked. Portal is `/c/[slug]/[token]` with a random 64-hex token; old links show "This report has a new link" **[V]** | Private token link |
| Middleware | README and PRODUCT-BIBLE: `proxy.ts` is "dead / needs middleware.ts" | The repo is on Next 16.2.7, where `proxy.ts` is the renamed middleware file. It has a matcher and is almost certainly live **[V]** that it exists; **[?]** that it runs, until confirmed against the installed Next docs or a preview deploy | Treat as active |
| Display font | README: "loads Merriweather" | `layout.tsx` loads Inter + Instrument Serif **[V]** | `design.md` is right |
| Plans | PRODUCT-BIBLE: trial 3 / solo 3 / growth 10 / agency 20, $29/$79/$149 | `PLAN_LIMITS` matches (also legacy basic/standard/pro). Billing page is display-only, "contact us to upgrade" **[V]** | Pricing not final — see §7 |
| Rate limits | AUDIT.md: "no rate limiting anywhere" | `checkRateLimit` exists (`src/lib/rate-limit.ts`) and is used on several routes **[V]** | AUDIT.md is stale |
| Security headers | AUDIT.md H2: none | `next.config.ts` sets CSP, HSTS, X-Frame-Options DENY, etc. **[V]** | AUDIT.md is stale |
| Sidebar "Infra signals" | README: hand-typed, not measured | Real mailbox, warmup and domain tables exist (`email_accounts`, `email_account_stats`, `email_domains`). Hand-typed signals remain only on the older client-detail page **[V]** | Advertise measured infrastructure only |
| Auth-page social proof | n/a | `AuthBranding.tsx` says "Trusted by 500+ top-tier lead generation agencies" and shows ★★★★★ **[V]** | **Unverified claim.** Do not reuse on the landing page; flag for removal from the auth panel |

---

## 2. Who Klaroh serves, and the problem

**Primary audience [V from CLAUDE.md, README]:** lead-generation and cold-email agencies that run campaigns for clients through a sending platform (today Instantly).

**Buyer vs. viewer.** The agency pays. The agency's *client* is the viewer who judges the agency by what they can see. Public copy should speak to the agency owner and treat the client's trust as the outcome.

**Operational problems the code addresses [V]:**

1. *Client reporting is manual and stale.* Agencies hand-build reports. Klaroh gives each client a private, always-current report link with configurable content (`client_portals`: view mode, KPI cards, campaigns included, section switches).
2. *Metrics are inconsistent and sometimes misleading.* One metric layer (`src/lib/analytics/metrics.ts`) defines each number, its source and its reliability. Unreliable metrics are withheld, never zero-filled.
3. *Deliverability problems are found late.* Infrastructure view covers mailboxes, warmup, and SPF/DKIM/DMARC/MX per sending domain; an "attention" list surfaces campaigns in error and mailboxes with issues.
4. *Positive replies are buried in the sending tool.* A read-only Inbox lists prospect replies, with positive conversations separable, and can be shown to the client.
5. *Clients can't tell whether the data is current.* Sync status (never / syncing / success / failed / needs re-auth) is derived from `sync_runs` timestamps, not page-load time.
6. *"Is this worth it?" is rarely answered.* Per-campaign cost and value-per-positive are entered by the agency and produce cost-per-positive. They are never synced or inferred.

**Versus using separate outbound tools [V, with limits]:** Klaroh does not send email or replace Instantly. It is a read layer on top: the sending tool produces raw numbers; Klaroh defines, checks and presents them for the agency and its clients. This is the honest differentiator: *trusted numbers and client-ready visibility*, not more sending features.

---

## 3. Feature maturity

### Implemented and reasonably reliable [V]

| Capability | Evidence | Caveat to carry into copy |
|---|---|---|
| Agency workspaces, signup/login/reset | `src/app/auth/*`, `workspaces`, `workspace_members` | 14-day trial logic exists in `plan-limits.ts`; signup copy says Terms and Privacy but **no such pages exist** (plain text only in `signup/page.tsx`) |
| Instantly connection (key validated, AES-256-GCM at rest, server-only) | `src/lib/encryption.ts`, `integrations` | Single provider |
| Campaign sync with daily snapshots + sync log | `src/lib/sync/*`, `campaign_stats`, `sync_runs` | Lifetime-to-date counters; history is stored but "All time" is the only period shown (`PERIOD_LABEL`) |
| Overview, Campaigns, campaign detail, step/variant analytics | `src/components/analytics/*`, `steps.ts` | Reply rate, positive rate, emails-per-positive only |
| Infrastructure: mailboxes, warmup, domains/DNS | `infrastructure.ts`, `email_*` tables | Depends on what Instantly reports |
| Needs-attention list | `attention.ts` | Only states the provider reports |
| Client portal on private token link; At-a-glance / Detailed views; rotate link | `client_portals`, `get_client_portal(token)`, `/c/[slug]/[token]` | Token link, `noindex`, no-referrer |
| Automatic portal summary (verdict chip + sentences) | `portal.ts` `verdictFor` | **Rule-based text, not AI.** Do not call it AI |
| Campaign economics | `campaign_economics`, `economicsSummary` | Agency-entered; currency explicit; no conversion |
| Sync status and freshness | `sync-status.ts`, `SyncStatus.tsx` | Freshness cadence — see "Freshness" below |
| Read-only Unibox (prospect replies) | `reply_threads`, `reply_messages`, `/inbox`, `PortalConversations` | Read-only; see "Inbox" below |
| Security headers, RLS, rate-limit RPC | `next.config.ts`, migrations | — |

**Freshness [V].** `vercel.json` has one cron: `/api/sync` at `0 4 * * *` (daily, UTC). Opening the app triggers an automatic sync, skipped within 30 seconds of the last success (`src/app/api/sync/route.ts`). Replies sync on the cron and via a "Sync replies" button (min 2 minutes apart). **This is not real-time.** "Always shows when it last synced" is true; "real-time" is not. The README, PRODUCT-BIBLE and CLAUDE.md all say "real-time". Public copy must not.

**Inbox [V].** It is read-only: prospects' replies are stored; the agency's own sent emails are not. Replying happens in the sending tool. "Positive" means the lead's status at the provider is interested / meeting booked / meeting completed / won, which can be set by the team or by Instantly's own AI.

### Partially implemented [V]

- **Bounce rate:** bounce count shown; rate withheld because `BOUNCE_UNIT_VERIFIED = false`.
- **Historical trends:** snapshots stored; `TrendChart` and portal `ProgressChart` exist, but period selection is not available (all-time only).
- **Client detail page** (`/clients/[slug]`) still uses an older data model, with hand-typed infrastructure signals.
- **Billing:** display-only, contact-by-email upgrade; no Stripe.
- **Team access:** `workspace_members` supports roles; whether a UI exists to invite colleagues is **[?]** not verified. Don't advertise teams.
- **Email:** Resend integration works but `EMAIL_FROM_ADDRESS` defaults to Resend's sandbox sender until a domain is verified (`send-email.ts`, `.env.example`).

### Planned / not available [V from docs and code]

Smartlead; AI summaries and the "planned AI agent" (`OPENAI_API_KEY` is reserved and unused; `generate-summary` is gone); open rate; meetings; revenue/ROI; Stripe self-serve billing; scheduled email reports; custom colour theming (logo and name only); remarks/updates feed.

---

## 4. Safe vs. unsafe public claims

**Safe to say (each tied to code):**

- Works with Instantly. Smartlead is "coming" only if the owner wants to say so — **[?]** no date.
- Each client gets a private report link that you control (what they see, which campaigns, rotate/revoke).
- Numbers are defined once and withheld when they can't be trusted.
- Shows when data last synced, and when a sync failed or the key needs reconnecting.
- Sending-infrastructure visibility: mailbox status, warmup score, domain DNS checks.
- A "needs attention" list built from provider-reported states.
- A read-only inbox of prospect replies, positive ones separable, optionally visible to clients.
- Campaign cost and value-per-positive, entered by you, give cost per positive response.
- Your logo and agency name on the client's report.
- Server-side encrypted API keys; keys are never shown after saving.

**Unsafe — do not publish:**

- "Real-time", "live" or "instant" data (daily cron + on-open sync).
- Open rate, meetings booked, revenue, ROI attribution.
- "AI-powered" anything (summary is rule-based; AI agent is unbuilt).
- "Trusted by 500+ agencies", star ratings, logos, testimonials, customer counts.
- "Full white-label" (no custom domain, no custom colours).
- Smartlead support as available.
- Specific prices, plan names or trial length, until the owner decides (§7).
- "Reply from Klaroh", "manage conversations", "CRM".
- Compliance statements (SOC 2, GDPR-compliant) — none verified.
- Any queue size, "spots left", or position number.

---

## 5. Positioning opportunities

**Reference review — limitation.** `https://www.outfound.io/` could not be fetched from this sandbox (DNS/proxy block). A web search returned only a short summary: headline "Own your outbound data", an analytics/data layer on top of Instantly/Smartlead/EmailBison, raw send/reply/deal data in a warehouse, CRM revenue attribution, an MCP server for querying data from AI tools, and a lead database. I did **not** see the page's layout, section order or copy, so the structural lessons below are drawn from that summary and general practice, not from direct observation of the page. **[?]** Re-check the live site in a browser before finalising structure.

**High-level principles to borrow (not copy):**

- Lead with the *problem in the buyer's own words*, then a precise product definition.
- State where the product sits ("on top of the tools you already use") so it isn't seen as a replacement.
- Show the real product early, not stock illustration.
- One primary CTA, repeated.

**Where Klaroh should be different [R]:**

- Outfound's emphasis is the *operator's* data ownership and attribution. Klaroh's emphasis is the *client relationship*: the agency's clients can see trustworthy numbers. Own that: **visibility the client can verify.**
- Outfound-style claims lean on revenue attribution. Klaroh has none, and that restraint is an asset: "we show what we can prove, and mark what we can't."
- Avoid AI-first framing. The competitive field is saturated with it, and Klaroh has no AI feature to point to.

---

## 6. Routing and architecture findings

All **[V]** unless marked.

**Root route.** `src/app/page.tsx` is `force-dynamic`; it calls `supabase.auth.getUser()` and redirects to `/dashboard` or `/auth/login`. It renders nothing.

**Proxy blocks the root.** `src/proxy.ts` (Next 16 middleware):

- Early-returns for `/api/*`, `/_next/*`, `/c/*`. These stay public.
- Otherwise redirects any signed-out request to `/auth/login` unless the path starts with `/auth/`. **So `/` (and any `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`) is redirected before the page ever renders.** Changing `page.tsx` alone will not make the landing page public.
- Signed-in users on `/auth/*` go to `/dashboard`.
- Matcher excludes `_next/static`, `_next/image`, `favicon.ico` and image extensions (`svg|png|jpg|jpeg|gif|webp|ico`). Files like `robots.txt`, `sitemap.xml`, `og.png` (png OK) need checking: `.txt`/`.xml` are **not** excluded by the matcher.
- It calls `auth.getUser()` (a Supabase network call) on every matched request.

**Root layout makes everything dynamic.** `src/app/layout.tsx` is `async` and reads `cookies()` for the `klaroh_sidebar_collapsed` cookie, wrapping the whole app in `SidebarProvider`. Reading cookies opts the entire tree into dynamic rendering, so the landing page could not be statically generated/cached. `SidebarProvider`/`useSidebar` are used only inside the dashboard shell (`DashboardLayout.tsx`, `clients/dashboard-layout.tsx`), so the cookie read and provider can move into `src/app/(dashboard)/layout.tsx` without changing behaviour. **[R]** — requires a test pass over the dashboard because of the first-paint sidebar offset (`design.md` says the offset is CSS-driven, which helps).

**Secure portal links.** `/c/*` is excluded from the proxy and the page is `noindex`, `referrer: no-referrer`. A landing page must not alter `/c/*` handling, and must not link to or reveal any `/c/<slug>/<token>` URL.

**CSP (`next.config.ts`).** `default-src 'self'`; `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com data:`; `img-src 'self' data: blob: https:`; `connect-src 'self' <supabase>`; `form-action 'self'`; `frame-ancestors 'none'`. Consequences: a same-origin `fetch('/api/waitlist')` is allowed; third-party analytics, embeds or video hosts would be blocked unless added; `next/font` self-hosts fonts so no change is needed. `frame-ancestors 'none'` prevents embedding the page elsewhere (fine).

**Design foundation [V].** Tokens in `src/app/globals.css` (`@theme`): primary `#003E2A`, primary-container `#0F573E`, surface `#F8F9FF`, cards `#FFFFFF`, status tones, radius 8px, `.btn`/`.input`/`.label`/`.field-error` classes, `.type-page-title` (Instrument Serif italic 28→32px), 12px type floor. Reusable UI: `Field`, `FormError`, `StatusChip`, `Panel`, `PageContainer`, `DataTable` (`src/components/ui/`). Charts use `--color-chart-*` tokens (existing dashboard files still hard-code hex — known issue, not ours).

**Framer Motion.** `package.json` `"framer-motion": "^12.40.0"`; `package-lock.json` resolves `12.40.0` **[V]**. Already used with `useReducedMotion` in `Sidebar.tsx`, `MobileMoreSheet.tsx`, `SettingsModal.tsx`, plus `Toggle` and `MobileBottomNav`. No `MotionConfig` is used anywhere. Reuse it; no new package.

**Supabase utilities [V].** `src/lib/supabase/server.ts` (cookie-based server client), `client.ts` (browser), `admin.ts` (service role; throws if env missing). `checkRateLimit(key, limit, windowSeconds)` calls the `check_rate_limit` SECURITY DEFINER RPC through the admin client and **fails open** on error. `clientIp()` reads the first `x-forwarded-for` entry.

**Email [V].** Resend via `getResend()` (lazy), `sendEmail()` logs every attempt to `email_logs` (stores full HTML body). `DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev'`. README and PRODUCT-BIBLE say the sending domain is **not yet verified**; with Resend's sandbox sender, mail only reaches the account owner's own address **[?: confirm current state in the Resend dashboard]**. `email_type` is a closed TypeScript union (`onboarding | client_invite | weekly_summary`) and `email_logs` may have a DB CHECK constraint **[?: not checked]**.

**Deployment [V].** `vercel.json` only contains the cron. No `.vercel/` directory. `CRON_SECRET`, `SUPABASE_*`, `RESEND_API_KEY`, `ENCRYPTION_KEY`, `EMAIL_FROM_ADDRESS` are the existing variables; README lists `OPENAI_API_KEY`, but `.env.example` says it is unused. Deployment is GitHub → Vercel; `main` is production. **[?]** Whether Vercel Preview deployments are enabled and use a separate Supabase project was not verifiable from the repo.

---

## 7. Waitlist implementation findings

**Existing building blocks [V]:**

- Server-only writes via the service-role client are the established pattern (`rate_limits`, `email_logs`, `create-client`).
- `rate_limits` has RLS enabled (baseline migration line 825) and the RPC is SECURITY DEFINER. Whether `anon` can EXECUTE `check_rate_limit` was not found in the migrations **[?]**; it is only invoked server-side today.
- API routes under `/api/*` bypass the proxy, so `POST /api/waitlist` needs no proxy change.
- Form components `Field` / `FormError` and `.input` / `.btn` already encode accessible validation (error at field, focus first invalid, `role="alert"`).

**There is no existing waitlist table.** Capturing signups needs one new table and therefore a migration — **not created in this audit**, as instructed. The smallest reliable design is in `docs/landing-page-implementation-plan.md`.

**Findings that shape the design:**

1. *Order.* A `bigint generated always as identity` id plus `created_at default now()` gives a strict, reproducible order; gaps (from rolled-back inserts) are possible, so **never present id as a "position"**.
2. *Duplicates.* Needs a unique index on the lower-cased, trimmed email. A duplicate must return the same success response as a new signup (otherwise the endpoint reveals who is on the list) and must **not** change the original `created_at`, preserving the first-come order.
3. *Consent.* The existing signup form references Terms/Privacy that don't exist. A waitlist collecting personal data (email, optionally IP) needs a real privacy notice. **[?]** Owner must supply the legal entity, contact address, retention period and region (affects GDPR/CAN-SPAM wording). I am not providing legal text as final.
4. *Abuse.* The rate limiter fails open if the database call errors. For a public endpoint, a failure mode of "unlimited inserts" is worse than "reject". Recommend a stricter, fail-closed variant for this route, plus a honeypot and an upper bound on total rows.
5. *Retrieval.* No admin UI exists, and building one is out of scope. The smallest operational answer is the Supabase dashboard (Table Editor / SQL / CSV export) since the table is service-role only.
6. *Confirmation email.* Not needed for v1: the success state on the page is the confirmation. Sending mail requires a verified Resend domain; with the sandbox sender, mail to arbitrary visitors will fail. `email_logs` also stores full bodies, which would put waitlist recipients into an existing table with different access assumptions. Defer.
7. *Queue size / position.* Not available and not to be promised (the owner asked for this explicitly). Count and order are computable from the table, but exposing them publicly invites gaming and creates a promise to maintain.

---

## 8. Risks, gaps and unresolved questions

### Must resolve before implementation

| # | Item | Why |
|---|---|---|
| 1 | **What does "access" mean, and who gets in?** Is early access a paid, free, or trial account? Does invitation create accounts, or does open signup (`/auth/signup`) stay available? | Open signup exists today and a waitlist conflicts with it **[V]**: anyone can already create an agency account at `/auth/signup`. Decide whether signup is gated (invite-only) or the waitlist is a soft promise. This is a product decision, not a front-end one |
| 2 | **Onboarding promise.** "First-come-first-served onboarding" implies capacity. How many agencies per week/month? Who runs onboarding? | Avoids a promise that can't be kept |
| 3 | **Privacy notice and terms.** Legal entity, contact, retention, region, processors (Supabase, Vercel). Also the unlinked Terms/Privacy on signup | Required to collect emails lawfully |
| 4 | **Waitlist table migration approval.** Owner must approve schema change and decide where it's applied (the project applies migrations manually to production per `supabase/README.md`) | Schema changes are out of scope here |
| 5 | **Auth-panel "500+ agencies" claim.** Remove or substantiate | Contradicts the transparency positioning |
| 6 | **Verify Next 16 behaviour.** Read `node_modules/next/dist/docs/` (after `npm install`) for `proxy.ts`, root layouts / `cookies()` dynamic opt-in, `metadata` file conventions (`robots`, `sitemap`, `opengraph-image`), and route handlers | `AGENTS.md` mandates it; this session could not |
| 7 | **Domain.** Is `klaroh.app` the production domain on Vercel? Is `hello@klaroh.app` a working mailbox? | Used in CTAs, metadata, canonical URLs |

### Should resolve

- Whether to name Smartlead as "coming soon" (no date exists).
- Whether pricing appears (recommend not; see §4).
- Product name in titles ("Klaroh"), tagline, OG image assets (none exist in `public/`: only `logo.svg`, `logo-icon.svg`).
- Analytics: none installed; CSP would need changes for third-party scripts. Recommendation: none at launch, or Vercel Web Analytics (first-party path) after confirming CSP behaviour **[?]**.
- Product screenshots/demo: the page needs a product demonstration built from *sample data*. It must be visibly labelled as sample/illustrative, never real customer numbers.
- Whether a signed-in visitor on `/` should see the landing page or be redirected to `/dashboard` (current behaviour). Recommended: redirect.
- Cron/freshness language depends on current Vercel plan (Hobby = daily cron, per `.env.example` comment).

### Risks

- **Over-claiming** is the main brand risk given Klaroh's transparency positioning; §4 is the guardrail.
- **Dynamic-rendering regression** if the root layout keeps reading cookies: slower first load and no CDN caching for the landing page.
- **Proxy regression:** loosening matching rules carelessly could expose dashboard routes. Use an exact-match allow-list, not prefix matching.
- **Spam/cost:** unbounded signups; mitigated by rate limiting, honeypot and row cap.
- **Stale docs:** README/PRODUCT-BIBLE would mislead anyone writing copy from them; consider updating after launch.
- **Reference limitation:** Outfound could not be inspected directly (see §5).
