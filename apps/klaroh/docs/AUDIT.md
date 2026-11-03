# Technical Audit Report — Klaroh

**Date:** 2026-06-10
**Scope:** Full codebase (`src/`, `supabase/`, config) on branch `claude/ready-check-sycj2n`
**Stack:** Next.js 16.2.7 (App Router) · React 19.2.4 · Supabase (`@supabase/ssr` 0.10.3, `supabase-js` 2.107) · OpenAI 6.42 · Resend 6.12 · Tailwind 4 · TypeScript 5
**Method:** Static read of every source and SQL file. No runtime/database introspection was available — items that depend on the live DB state are explicitly flagged **[needs runtime verification]**.

---

## System Map

### Routes — Pages (App Router)
| Route | Type | Auth gate | Notes |
|---|---|---|---|
| `/` | Server | `force-dynamic` | Redirects to `/dashboard` or `/auth/login` |
| `/auth/login` | Client | public | `signInWithPassword` |
| `/auth/signup` | Client | public | `signUp` + writes `agency_details` + fires onboarding email |
| `/auth/reset-password` | Client | public | |
| `/auth/reset-password-confirm` | Client | public | |
| `/dashboard` | Server + Suspense | middleware | Lists clients (server fetch) |
| `/clients` | Server + Suspense | middleware | Client list/data |
| `/clients/[slug]` | Server + Suspense | middleware | **Looks up client by slug (public read)** |
| `/settings` | Client | middleware | **Entirely stubbed/fake — saves nothing** |
| `/settings/billing` | Client | middleware | **Queries non-existent `agencies` table — dead** |
| `/c/[slug]` | Server (public) | none (intentional) | Public client dashboard |

### Routes — API (all under `/api`, all `POST`, all **outside middleware matcher**)
| Endpoint | Auth check | Agency scoping | Risk |
|---|---|---|---|
| `create-client` | ✅ getUser | ✅ resolveAgencyId | admin client (RLS bypass) for slug uniqueness |
| `delete-client` | ✅ | ✅ `.eq(agency_id)` | OK |
| `update-client-name` | ✅ | ✅ ownership verified | OK |
| `update-client-status` | ✅ | ✅ `.eq(agency_id)` | OK |
| `delete-campaign` | ✅ | ❌ **no agency scope** (relies on RLS) | silent success on 0 rows |
| `edit-campaign` | ✅ | ❌ **no agency scope** (relies on RLS) | silent success on 0 rows |
| `send-onboarding-email` | ⚠️ admin `getUserById` only | n/a | unauthenticated trigger |
| `send-remark-email` | ❌ **NONE** | ❌ | **open email relay + HTML injection** |
| `generate-summary` | ⚠️ `user.id === agencyId` | n/a | dead (`summaries` table missing), uncapped OpenAI cost |
| `sync-smartlead` | ✅ | n/a | stub (`setTimeout`), does nothing |

### Server actions / data layer (`src/lib/data/`)
- `agency.ts::resolveAgencyId` — resolves/auto-creates `agency_details.id`.
- `clients.ts` — `getClients`, `getFirstClient`, `getClientBySlug` (public read).
- `campaign.ts` — `getCampaignData` (RPC, **browser client**), `getCampaignsList`.
- `integrations.ts` (`'use server'`) — Smartlead key save/mask/disable (encryption).
- `remarks.ts` (`'use server'`) — `getRemarks`, `addRemark`.
- `usage.ts` — `getClientCount`.

### Supabase tables & RLS (final state after migrations 01–16)
| Table | RLS on | Owner policy | Public policy | Concern |
|---|---|---|---|---|
| `agency_details` | ✅ | `auth.uid() = user_id` | — | OK |
| `clients` | ✅ | `agency_id ∈ my agencies` | **`public_read_client_slug` USING (true)** | full-table read by anon |
| `campaigns` | ✅ | `agency_id ∈ my agencies` | **`public_read_campaigns` USING (true)** | full-table read by anon |
| `remarks` | ✅ | `owner_all_remarks` references **dropped** `clients.user_id` | **`public_read_remarks` USING (true)** | writes possibly broken **[needs runtime verification]**; full-table read by anon |
| `integrations` | ✅ | `agency_id ∈ my agencies` | — | OK (holds encrypted API keys) |
| `email_logs` | ✅ | `auth.uid() = user_id` read-only | — | OK |

### External services
- **Supabase** (auth + Postgres + RLS).
- **OpenAI** (`gpt-4o-mini`) — `generate-summary` (currently dead/uncapped).
- **Resend** — transactional email (`onboarding@resend.dev` sender — unverified default domain).

### Critical user paths
1. **Auth:** signup (`auth.signUp` → upsert `agency_details` → onboarding email) → middleware (`proxy.ts`) → `/dashboard`.
2. **Dashboard:** server `getUser` → `getClients` → client list.
3. **Core feature:** `/clients/[slug]` → client-side waterfall (`getUser` → `agency_details` → `campaigns` → `remarks` → infra signals) → Recharts.
4. **Public share:** `/c/[slug]` → `getClientBySlug` + `get_public_campaign_data` (SECURITY DEFINER) + `getRemarks`.

---

## Executive Summary

**Overall health: NOT production-ready for a multi-tenant SaaS.** The application is a well-styled prototype with a serious, systemic authorization defect at the database layer that exposes every tenant's data to the public, plus an unauthenticated email-sending endpoint and weak secret handling. Functionally, several "features" (settings save, billing, summary generation, Smartlead sync) are stubs or wired to tables that do not exist in the migration set. Architecturally, the core dashboard fetches all data **client-side with the public anon key**, which both leaks data and forfeits the App Router's server-rendering/streaming benefits.

**The 3 biggest risks right now:**
1. **Multi-tenant data breach (CRITICAL).** RLS `USING (true)` "public read" policies on `clients`, `campaigns`, and `remarks` mean anyone holding the public anon key (shipped in the browser bundle) can dump **every agency's** client list, campaign performance, and private remarks. This is a full horizontal-privilege-escalation / data-exfiltration hole.
2. **Unauthenticated email relay (CRITICAL).** `POST /api/send-remark-email` has no auth and injects caller-supplied `author`/`content` straight into HTML email. It is a spam cannon and a phishing/HTML-injection vector running on your Resend reputation.
3. **Broken secret & data-model hygiene (HIGH).** Encryption falls back to a hardcoded key; two contradictory SQL schemas coexist; multiple shipped pages query tables that don't exist. At 10x load these turn into silent data loss, support tickets, and an onboarding nightmare.

---

## Critical — Fix Before Next Deploy

### C1. RLS "public read" policies expose all tenants' data
- **File:** `supabase/03_rls.sql` (lines 18–19, 36–37, 49–50)
- **Issue:** Three policies are `for select using (true)`:
  `public_read_client_slug` (clients), `public_read_campaigns` (campaigns), `public_read_remarks` (remarks). Postgres combines policies with **OR**, so these completely neutralize the agency-scoped `owner_all_*` policies for SELECT. The anon key is public (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, embedded in client JS).
- **Impact:** Any visitor can run `supabase.from('campaigns').select('*')` / `.from('clients')` / `.from('remarks')` and exfiltrate **every agency's** entire dataset — client names/slugs, email volumes, open/reply rates, lead counts, and private status remarks. This is a reportable data breach and an instant due-diligence failure. Confirmed reachable: `clients/[slug]/page.tsx:19` lets any logged-in agency open any other agency's dashboard by slug.
- **Fix:** Remove the blanket public policies. The public `/c/[slug]` page already gets campaign data through `get_public_campaign_data` (SECURITY DEFINER, `10_public_campaign_data.sql`). Do the same for the two reads that still hit tables directly:
  - Drop `public_read_campaigns` immediately — **nothing uses it** (public page uses the definer RPC). This alone closes the largest leak with zero app changes.
  - Replace `getClientBySlug` (`src/lib/data/clients.ts:56`) and `getRemarks` (`src/lib/data/remarks.ts:10`) on the public path with SECURITY DEFINER RPCs scoped to a single slug/client_id, then drop `public_read_client_slug` and `public_read_remarks`.
  ```sql
  drop policy if exists "public_read_campaigns" on campaigns;
  drop policy if exists "public_read_remarks"   on remarks;
  drop policy if exists "public_read_client_slug" on clients;
  -- expose only what the public page needs via SECURITY DEFINER functions
  ```

### C2. `send-remark-email` — no auth + HTML injection
- **File:** `src/app/api/send-remark-email/route.ts` (lines 4–25)
- **Issue:** No `getUser()` check, no ownership check; `author` and `content` are interpolated raw into the email HTML (lines 10–12). Anyone on the internet can POST arbitrary recipient/sender/body.
- **Impact:** Open spam/phishing relay on your Resend account (reputation + cost + potential domain blacklisting), and HTML injection into delivered emails. Trivially scriptable for mass abuse.
- **Fix:** Require an authenticated session, verify the target client belongs to the caller's agency, and HTML-escape `author`/`content`. Rate-limit per user.

### C3. Hardcoded encryption-key fallback for stored API keys
- **File:** `src/lib/encryption.ts` (line 3)
- **Issue:** `const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-insecure-key-change-this';`. If the env var is ever unset (new env, misconfig), Smartlead API keys are encrypted with a key that is **public in this repo**. Additional weaknesses: crypto-js `AES.encrypt(passphrase)` uses the legacy OpenSSL EVP_BytesToKey (MD5, 1 iteration) KDF — weak; and `decrypt` returns an **empty string** (not an error) on a wrong key, so failures are silent.
- **Impact:** Customer Smartlead credentials recoverable by anyone with the DB dump (e.g. via C1) and the repo. Silent decrypt failures cause "integration randomly disconnected" support load.
- **Fix:** Throw on startup if `ENCRYPTION_KEY` is missing or equals the default. Move to `node:crypto` AES-256-GCM with a random IV per record and an authentication tag (detects tampering/wrong key). Plan a key-rotation/re-encrypt path.

---

## High — Fix This Sprint

### H1. IDOR-shaped campaign mutations rely entirely on RLS + fail silently
- **File:** `src/app/api/delete-campaign/route.ts:25-28`, `src/app/api/edit-campaign/route.ts:25-28`
- **Issue:** Both mutate `campaigns` filtered by `id` only — no `.eq('agency_id', …)`. Authorization depends 100% on the `owner_all_campaigns` RLS policy (which *is* agency-scoped, so it is not currently exploitable), but there is no defense-in-depth like `delete-client` has, and neither route checks the affected-row count — a no-op (wrong id / other tenant) returns `{ success: true }`.
- **Impact:** Any regression in RLS becomes an immediate cross-tenant delete/edit. Silent success masks bugs and confuses users.
- **Fix:** Add `.eq('agency_id', agencyId)` and assert a row was affected (`.select()` + check length), returning 404 otherwise.

### H2. No security headers
- **File:** `next.config.ts` (empty config)
- **Issue:** No CSP, HSTS, X-Frame-Options/`frame-ancestors`, Referrer-Policy, X-Content-Type-Options, Permissions-Policy.
- **Impact:** Clickjacking of the dashboard, no MIME-sniffing protection, referrer leakage, no transport pinning. Standard pen-test findings.
- **Fix:** Add a `headers()` block (or `middleware`/`proxy` response headers) with a strict CSP, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.

### H3. No rate limiting anywhere
- **Files:** all of `src/app/api/*`, plus client-side auth calls
- **Issue:** No throttling on auth, email, or AI endpoints.
- **Impact:** Credential stuffing on login; spam via `send-remark-email`/`send-onboarding-email`; **uncapped OpenAI spend** via `generate-summary`. At 10x load (or one malicious actor) these are direct cost/abuse vectors.
- **Fix:** Add per-IP/per-user rate limiting (Upstash Ratelimit or a Postgres token bucket) at minimum on auth, the two email routes, and `generate-summary`.

### H4. Core dashboard fetches all data client-side over the anon key (waterfalls + data leak surface)
- **Files:** `src/app/clients/dashboard-layout.tsx:52-113` (4 sequential `useEffect` fetches), `src/app/clients/campaign-section.tsx:73-197` (campaigns `select('*')`, infra signals, writes)
- **Issue:** The "server" pages (`/clients/[slug]`) only resolve the slug, then hand off to a `'use client'` tree that re-fetches `getUser` → `agency_details` → `campaigns` → `remarks` → infra **sequentially on mount** with the browser client. The page-level `<Suspense>` boundaries wrap client components, so they stream nothing useful from the server.
- **Impact:** Slow LCP/INP (blank → spinner → data, each request gated on the prior), more round-trips, and it is only the data path that makes C1 exploitable from the app itself. Degrades badly on mobile/slow networks and at scale (every client re-derives the same agency lookups).
- **Fix:** Move these reads into Server Components / server actions (already have `createClient` server + `getCampaignData`), fetch in parallel with `Promise.all`, pass data down as props, and let real `<Suspense>` stream from the server. Collapse the agency/campaign/remarks/infra reads into one RPC or a single joined query.

### H5. Middleware (`proxy.ts`) fails open and adds a network hop per navigation
- **File:** `src/proxy.ts:22-63`
- **Issue:** The whole auth check is wrapped in `try { … } catch { return NextResponse.next(); }` — any Supabase error lets the request through. It also calls `auth.getUser()` (a network round-trip to Supabase) on **every** matched request.
- **Impact:** Transient Supabase issues silently disable the auth redirect (pages still gate, but the guarantee is gone); per-navigation latency tax that compounds at scale.
- **Fix:** On error, fail closed for protected routes (redirect to login). Keep `getUser` but ensure session refresh is the only work done; consider scoping the matcher more tightly.

### H6. `remarks` write policy depends on a dropped column
- **Files:** `supabase/03_rls.sql:41-46` vs `supabase/15_cleanup_user_id_columns.sql:15` (`ALTER TABLE clients DROP COLUMN user_id CASCADE`)
- **Issue:** `owner_all_remarks` is defined as `client_id in (select id from clients where user_id = auth.uid())`. Migration 15 drops `clients.user_id` with `CASCADE`, which in Postgres drops policies that depend on that column. `remarks` was never given an `agency_id` and no replacement write policy was added. **[needs runtime verification]** — likely either the policy is gone (so authenticated `addRemark` inserts are denied and the feature is broken) or the migration errored.
- **Impact:** Either a broken core feature (posting updates) or an inconsistent RLS surface.
- **Fix:** Add `agency_id` to `remarks` (backfill from `clients`) and create an agency-scoped `owner_all_remarks` policy with `with check`. Verify insert/update/delete paths.

---

## Medium — Fix Next Sprint

### M1. Two contradictory SQL schemas in one repo
- **Files:** `supabase/schema.sql` + `supabase/seed.sql` (standalone `agencies` table, `clients.industry`, Stripe fields) vs `supabase/01_…16_*.sql` (the real `agency_details` model).
- **Impact:** No single source of truth. A new hire (or a `db reset`) can apply the wrong file and produce a different, broken schema. This is the root cause of M2/M3.
- **Fix:** Delete the legacy `schema.sql`/`seed.sql`/`demo_data*.sql` or move them to an `archive/` folder with a README. Document the canonical migration order.

### M2. `/settings/billing` queries a non-existent table
- **File:** `src/app/settings/billing/page.tsx:42-47`
- **Issue:** `supabase.from('agencies').select('*').eq('id', user.id)` — `agencies` does not exist in the migration set (dropped in `01_cleanup.sql`). Always returns null; the "Current Plan/usage" block never renders. Also conflates `agency.id` with `user.id`.
- **Impact:** Dead billing UI; misleading to investors during a demo.
- **Fix:** Point at `agency_details` (+ a real plan/usage source) or remove the page until billing exists.

### M3. `/settings` page is a non-functional stub
- **File:** `src/app/settings/page.tsx` (whole file)
- **Issue:** Hardcoded `'Velocity Marketing'`, fake `setTimeout` handlers that save nothing, fake "Connected" state. The real settings logic lives in `SettingsModal.tsx` (924 lines).
- **Impact:** Users editing this page lose their input silently; two competing settings UIs.
- **Fix:** Either wire it to the real server actions or remove it and route to the modal.

### M4. `generate-summary` is dead and uncapped
- **File:** `src/app/api/generate-summary/route.ts`
- **Issue:** Reads a `summaries` table that doesn't exist (always 400s), uses the legacy `user.id === agencyId` auth model, `catch (error: any)`, and calls OpenAI with no spend guard.
- **Impact:** Dead code carrying a live cost/abuse surface if ever reached.
- **Fix:** Remove it, or implement against the real schema with auth + rate limiting + a token budget.

### M5. Email HTML injection in remaining templates / inputs
- **Files:** `src/app/api/send-remark-email/route.ts:10-12`, `src/lib/email/templates/client-invite.ts`, `addRemark` content rendered in `RemarksTimeline`
- **Issue:** User-controlled strings (`author`, `content`, client `name`) flow unescaped into email HTML.
- **Impact:** Phishing-grade HTML injection in delivered emails; reputational damage.
- **Fix:** HTML-escape all interpolated values in every template.

### M6. Over-fetching with `select('*')`
- **Files:** `campaign-section.tsx:84,127`, `dashboard-layout.tsx:99`, `clients.ts:9`, `integrations.ts:48`, `generate-summary:23`
- **Issue:** `select('*')` (incl. wide `campaigns` rows and `integrations` rows that contain `api_key_encrypted`).
- **Impact:** Larger payloads, and pulling the encrypted key to the browser whenever `getActiveIntegration` runs client-side. Degrades as columns grow.
- **Fix:** Scope every `.select()` to the exact columns used; never select `api_key_encrypted` outside server code.

### M7. Sender domain & module-load crash
- **Files:** `src/lib/resend.ts:3-5`, all `from_email: 'onboarding@resend.dev'`
- **Issue:** Emails are sent from Resend's shared sandbox domain (`resend.dev`) — poor deliverability and not brandable; and `resend.ts` `throw`s at import time if `RESEND_API_KEY` is missing, which can crash unrelated routes/builds.
- **Fix:** Use a verified custom domain (SPF/DKIM/DMARC); lazily construct the Resend client and fail per-request, not at import.

### M8. Race + weak validation in client creation
- **File:** `src/app/api/create-client/route.ts:38-57`
- **Issue:** Check-then-insert on `slug` is a race (two requests can pass the conflict check). Auto-generated slug from `name` (lines 40–43) is not re-validated with `isValidSlug` and can be empty for all–non-alphanumeric names. The DB `unique` constraint will catch dupes but surfaces as a generic 500.
- **Fix:** Rely on the unique constraint and translate `23505` to a clean 409; validate the generated slug; consider a transaction.

---

## Low / Housekeeping

- **L1.** `src/app/page.tsx:1` `force-dynamic` is justified (auth redirect), but the redirect-only Home could be handled in middleware to save a render.
- **L2.** Dead/duplicate files: `CLAUDE.md.backup`, `supabase/demo_data.sql`, `supabase/demo_data_seed.sql`, default `public/*.svg` (`next.svg`, `vercel.svg`, `window.svg`, `globe.svg`, `file.svg`), and `09_demo_campaigns.sql::insert_demo_campaigns` (dropped in 14; its INSERT also conflicts with the generated `leads_generated` column from 11).
- **L3.** `README.md` is the untouched create-next-app boilerplate (mentions Geist; the app uses Inter/Merriweather).
- **L4.** Brand mismatch: CLAUDE.md specifies **Instrument Serif**, but `layout.tsx:12` loads **Merriweather** under the `--font-instrument` variable. Primary color also differs (`#0F573E` in guidelines vs `#2D6A4F` in `tailwind.config.ts`).
- **L5.** `recharts` and `framer-motion` are large and bundled into client components without `next/dynamic` lazy-loading (`campaign-section.tsx`, `Sidebar.tsx`, `SettingsModal.tsx`).
- **L6.** Public agency logo uses a raw `<img>` (`c/[slug]/page.tsx:90`) with an eslint-disable instead of `next/image`.
- **L7.** `tsconfig` `target: ES2017`; consider ES2020+ for smaller transpiled output.
- **L8.** Pervasive swallowed errors (`catch { return [] }`, `/* ignore */`) across the data layer and client effects — no observability. There is no logging/monitoring/error-reporting hook anywhere (only `console.*`).
- **L9.** `any` types in `generate-summary`, `sync-smartlead`, `billing/page.tsx`, and `campaign-section.tsx` aggregation.

---

## Architecture & Scalability — what breaks first at 10x

- **First to break: the trust/security model**, not throughput. C1 means scale = more tenants whose data is mutually readable; the blast radius grows with every signup.
- **Single points of failure:** every request path funnels through Supabase auth (`getUser` in `proxy.ts` on each navigation + again in pages + again client-side). A Supabase hiccup degrades all routes, and `proxy.ts` fails *open*.
- **Silent failures:** swallowed catches (L8), no-op-success mutations (H1), missing-table queries (M2/M4), and the remarks RLS question (H6) will surface as untraceable "it doesn't save" bug reports.
- **Cost blow-ups:** uncapped OpenAI (`generate-summary`) and unthrottled email (Resend) are direct $ at abuse/scale.
- **Onboarding friction:** dual schemas (M1) and stub pages (M3/M4) mean a new engineer cannot trust the repo as documentation.
- **Client-side data fetching (H4)** multiplies DB round-trips per user and forfeits caching/CDN — the dashboard will feel slow well before the DB is actually stressed.

---

## Quick Wins (Top 5 — highest impact, <30 min each, low risk)

1. **Drop `public_read_campaigns`.** `DROP POLICY "public_read_campaigns" ON campaigns;` — closes the largest data leak (all agencies' performance metrics) with **zero app changes**, because the public page already reads campaigns via the `get_public_campaign_data` SECURITY DEFINER RPC. *(File: `supabase/03_rls.sql:36-37`.)*
2. **Add auth + HTML-escaping to `send-remark-email`.** Require `getUser()`, verify the client belongs to the caller's agency, and escape `author`/`content`. Kills the open relay. *(File: `src/app/api/send-remark-email/route.ts`.)*
3. **Make `ENCRYPTION_KEY` mandatory.** Replace the `|| 'default-insecure-key-change-this'` fallback with a startup throw when missing or equal to the default. *(File: `src/lib/encryption.ts:3`.)*
4. **Add security headers** via `headers()` in `next.config.ts` (HSTS, X-Frame-Options: DENY, Referrer-Policy, X-Content-Type-Options, a starter CSP). *(File: `next.config.ts`.)*
5. **Harden the campaign mutations.** Add `.eq('agency_id', agencyId)` and an affected-row check (return 404 on no-op) to `delete-campaign` and `edit-campaign`. *(Files: `src/app/api/delete-campaign/route.ts`, `edit-campaign/route.ts`.)*

---

## Recommended Sprint Plan

**Week 1 — Stop the bleeding (security).**
- C1: remove all three `USING (true)` policies; move public client/remarks reads to SECURITY DEFINER RPCs scoped by slug/id; verify `/c/[slug]` still works.
- C2 + Quick Win 2: lock down `send-remark-email` (and review `send-onboarding-email`).
- C3 + Quick Win 3: mandatory encryption key; migrate to AES-256-GCM via `node:crypto`.
- H2/H3 + Quick Wins 4/5: security headers, rate limiting on auth/email/AI, harden campaign mutations.
- H6: resolve the `remarks` RLS/`agency_id` question (verify against the live DB).

**Week 2 — Correctness & data model.**
- M1: collapse to one canonical schema; delete/Archive legacy SQL; document migration order.
- M2/M3/M4: fix or remove billing, settings stub, and dead `generate-summary`.
- M5/M6/M7: escape all email templates; scope every `select()`; verified sender domain + lazy Resend client.
- H1 follow-through: consistent agency scoping + row-count assertions across all mutations.

**Week 3 — Performance & hardening.**
- H4: move dashboard data fetching server-side; parallelize with `Promise.all`; real server `<Suspense>` streaming; collapse N round-trips into joined queries/RPCs.
- H5: fail-closed middleware; tighten matcher.
- L5/L6/L7: lazy-load recharts/framer; `next/image`; bundle/TS-target trims.
- L8: add structured logging + error reporting (e.g. Sentry) and stop swallowing errors silently.

---

*Prepared as a static audit. Items marked **[needs runtime verification]** require running the migrations against a live Postgres instance and probing the anon endpoint to confirm exact behavior.*
