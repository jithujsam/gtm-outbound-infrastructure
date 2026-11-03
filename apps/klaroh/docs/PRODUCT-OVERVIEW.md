# Klaroh: Product Overview

> A marketing-oriented reference of what Klaroh is, who it is for, the problems it solves, and every capability it ships today. Written from the code as of October 2026 (private beta, V2).
>
> For engineering detail see [`README.md`](../README.md); for visual rules see [`design.md`](./design.md). `PRODUCT-BIBLE.md` describes the retired V1 product and should not be used for positioning.

---

## 1. The one-line pitch

**Klaroh gives cold email agencies one place to see every client's outbound: results, replies and sending health. It also gives each client a private report, so nobody has to rebuild a spreadsheet every week.**

Tagline family used on the site: *"If we cannot verify a number, we do not show it."*

## 2. Who it is for

| Audience | Situation | What they get |
|---|---|---|
| **Cold email / lead generation agencies** (primary) | Run Instantly campaigns for several clients; spend hours each week assembling reports and answering "how's it going?" | One operations view across all clients, plus a ready-made client report |
| **Agency owners and heads of delivery** | Need to know which campaigns work and which mailboxes are about to hurt deliverability | Cross-client rankings, an "attention" list, infrastructure health |
| **Account managers** | Face the client's questions and have to prove value | A private link per client with plain-language status, replies and cost per positive response |
| **Founders / GTM teams running outbound across multiple accounts** (secondary) | Same fragmentation, internal rather than client-facing | The same dashboards, without the sharing layer |
| **The agency's clients** (viewers, never users) | Want proof the money is working without learning a tool | A no-login, branded, plain-English report |

**Not for (today):** teams that need Klaroh to send email, run sequences or replace their sending tool. Klaroh is read-only on the sending platform. It only works with **Instantly** today (Smartlead is listed in the product as "on the way").

## 3. The problem

Outbound for a client lives in **five different places**:

1. Campaign results, in the sending tool
2. Replies, in a shared inbox
3. Mailbox status, in another dashboard
4. Domain checks, in a separate tool
5. Client reports, in a spreadsheet rebuilt weekly

Consequences Klaroh is built to remove:

- **Reporting tax:** hours per client per week copying numbers into a deck or sheet.
- **Client anxiety:** clients who can't see progress ask for updates, or churn quietly.
- **Silent infrastructure failure:** a mailbox in error or a failing DNS record drags down results before anyone notices.
- **Metric disputes:** reply rate and "positive reply rate" mean different things in different tools, so numbers don't match and trust erodes.
- **Per-client workspaces:** agencies that give each client its own Instantly workspace have no cross-client view at all.

## 4. How it solves it (the positioning)

1. **One connection, every client.** Connect Instantly once per workspace; assign campaigns to clients.
2. **One definition per number.** Every rate follows a fixed, documented formula. Anything Klaroh cannot verify is hidden rather than guessed.
3. **Honest about freshness.** Data syncs on a schedule and the last sync time is always visible. A failed sync is shown as failed.
4. **Client-ready by default.** A private, branded, plain-language report per client, with the agency controlling every figure shown.
5. **Read-only and safe.** Klaroh never sends email, and credentials are encrypted.

## 5. How it works (the four steps)

| Step | What happens |
|---|---|
| **Connect** | Paste an Instantly API key (API v2) once. It is validated against Instantly, then encrypted (AES-256-GCM) and never shown again. |
| **Select** | For each client, pick which campaigns they should see. Only those campaigns are imported and synced. Never the whole provider account. |
| **Monitor** | Results, replies and mailbox status sit side by side, with the last sync time visible. |
| **Share** | Send each client a private link. The agency chooses what they see and can replace the link at any time. |

---

## 6. Complete feature list

### 6.1 Account, workspace and access

- **Agency signup, login and password reset** (email and password, reset links by email).
- **Workspace model:** each agency is a workspace with members (owner / admin / member roles). All data is scoped to the workspace.
- **Settings** (dialog from the sidebar): *General* (agency name, website, default timezone, brand logo upload), *Integrations*, *Account* (name, email, password), *Billing & Plan*.
- **Welcome / onboarding email** sent on signup, with a rate limit per IP.
- **14-day free trial**, then a plan; client limits are enforced server-side (see 6.9).

### 6.2 Integrations and data sync

- **Instantly integration** (API v2): validate, connect, replace key, disconnect. On disconnect, syncing stops and the key is purged, but campaigns and history are kept.
- **Provider-adapter architecture:** the database and UI never use provider field names, so adding Smartlead or another tool means adding one adapter.
- **Campaign discovery:** list the campaigns in the connected account (nothing stored), then **import only the ones selected** for a client.
- **A campaign can serve several clients**, and the link is the sync scope.
- **Scheduled sync:** a daily cron (04:00 UTC) refreshes every connected workspace, plus an automatic refresh when pages open (skipped if synced within 30 seconds) and a manual **Sync** button.
- **Daily historical snapshots:** one stats row per campaign per day, kept for history and trend charts.
- **Sync log and status:** every run is recorded (success / partial / failed, counts, error). The UI shows syncing, stale, never-synced and failed states instead of hiding them.
- **Reply sync:** inbound prospect replies are synced separately, with spaced requests to respect provider limits.
- **Campaign lifecycle awareness:** if the provider stops returning a campaign, Klaroh flags it as *no longer returned* and keeps the last-synced figures.
- **Retries and paging** against the Instantly API, with tests for adapter, paging and retry behaviour.

### 6.3 Client management

- **Create, rename, set status (active / paused / ended) and delete clients**, with a unique link name (slug) generated from the client name.
- **Client onboarding flow:** create client → connect your sending tool (or reuse the workspace connection) → pick campaigns → import → dashboard renders.
- **Per-client dashboard** (`Clients` area) with the client's campaigns, integration state and sync status.
- **Client list view** in the sidebar for fast switching, plus a mobile-friendly layout.
- **Campaign management per client:** import more campaigns, rename a campaign inside Klaroh (the provider name is kept separately), remove a campaign from a client (history kept).
- **Optional client invite email** with their report link.
- **Delete cleanup** that removes dependent data correctly.

### 6.4 Overview (cross-client operations view)

Answers: *"How is the whole outbound operation performing?"*

- **Headline performance tiles** across all clients or filtered by client, campaign or provider (filters live in the URL, so views are shareable and persist while navigating).
- **"Needs attention" list:** a short, prioritised list built only from states the sending platform reports: campaigns in error or suspended (critical), mailboxes with sending errors / warmup / DNS issues (critical or warning), campaigns no longer returned by the provider (warning). "All clear" never over-claims.
- **Outcomes by campaign** ranking (switch between positive responses, positive rate and human replies; click a bar to open the campaign).
- **Results by client** ranking and breakdown.
- **Replies per day** activity chart (last 90 days).
- **Progress over time** trend charts from the daily snapshots, shown only once there is enough history to be meaningful (minimum points and span).
- **Sync status bar** showing last sync, in-progress, failed and stale-range states.

### 6.5 Campaigns (compare what works)

Answers: *"Which campaigns are working, on the same trusted metrics?"*

- **Campaign comparison table:** sortable by any metric, default ordering by positive rate.
- **Outcome ranking chart.**
- **Campaign detail page:**
  - Campaign facts (provider, status, schedule data as available)
  - Performance cells with low-volume warnings (under 100 prospects, so rates can swing)
  - **Against other campaigns:** rank within the workspace
  - **Sequence steps:** which step and variant gets replies (lifetime per step, with a minimum sample size before conclusions are drawn)
  - **Sending infrastructure:** the mailboxes this campaign sends from, with status, warmup health and daily-limit use
  - Trend history and observations

### 6.6 Inbox (replies by client)

Answers: *"What are prospects saying across all my clients?"*

- **One inbox for every client's campaigns**, filterable by client.
- **Filters:** *Positive* and *All human replies*. Out-of-office and other automatic replies are left out.
- **Lead status as marked in Instantly** (interested, meeting booked, meeting completed, won, not interested, and so on), shown as colour-coded chips.
- **Conversation detail view** with the message thread, prospect and company labels.
- **Reply-sync status bar** and precise empty states (never synced, syncing first time, sync failed, no replies, only automatic replies, no positive replies).
- Reads only; replying happens in the sending tool.

### 6.7 Infrastructure (is the sending setup healthy?)

Three sub-views: **Accounts**, **Warmup**, **Domains**, plus a summary.

- **Mailbox ("Email ID") summary:** total, active, warming, healthy, with issues, sending domains count.
- **Needs attention:** mailboxes ranked by severity with specific flags: *sending error*, *warmup unhealthy*, *DNS failing*, *no sends in 3 days*, *over daily limit* (bounce flags are intentionally off until the unit is verified).
- **Health at a glance:** distribution bars for account status, warmup health and domain DNS (kept as three separate questions, because an active mailbox can still have poor warmup or failing DNS).
- **Sending capacity:** capacity in use (30-day average campaign sends ÷ combined daily limit of active mailboxes) and a send-imbalance indicator.
- **Campaign sending per day** chart (warmup excluded).
- **Warmup page:** warmup health scores (good ≥ 90, fair ≥ 75, poor below), warmup volume totals, per-mailbox detail.
- **Domains page:** SPF, DKIM, DMARC and MX checks per sending domain, sorted by risk, linked to the mailboxes on them.
- **Accounts page:** every sending mailbox with status, warmup, daily limit and recent sending.
- Filterable by client, campaign and provider like the rest of the analytics.

### 6.8 Client portal (the shareable report)

A private, no-login report at `/c/[slug]/[token]`, branded with the agency's logo and name.

**What the client sees**
- **"At a glance" view:** status, headline numbers and a plain-language summary (deterministic rules, not AI), e.g. *"We reached 1,240 prospects and 47 replied. 12 responded positively."*
- **Detailed report view:** key figures, progress over time, investment, campaigns and sending infrastructure. The client can switch between both views.
- **Key figures with plain-English definitions** on hover: emails sent, prospects reached, replies, positive responses, reply rate, positive response rate, bounces.
- **Sending infrastructure** summary for the client's campaigns.
- **Investment / economics:** campaign cost, cost per positive response, and the agency's estimate of value per positive response, in any ISO currency (never converted between currencies).
- **Conversations with interested prospects** (positive replies only, client-friendly labels).
- **Insufficient-data and empty states** that say so honestly instead of showing zeros.
- Mobile-responsive.

**What the agency controls (Client portal settings)**
- Which view the report opens on (*At a glance* or *Detailed report*)
- Which key figures appear and in what order
- Which campaigns are included (or all, including future ones)
- Show or hide infrastructure, economics and conversations
- Enter cost, currency and value per positive response per campaign
- **Preview** the exact client view before sharing
- **Copy the private link** and **rotate** it at any time (the old link stops working)

**Security of sharing:** the old slug-only link no longer opens a report because slugs are guessable. The link needs a secret token. Public reads go through scoped database functions that return one client's data only, never internal IDs, and are never indexed (`noindex`, no-referrer).

### 6.9 Billing and plans

- **Free 14-day trial**, no card.
- Client limits by plan: **Solo (3), Growth (10), Agency (20)**; trial is 3.
- Billing page shows current plan, usage ("3 of 3 clients"), trial days remaining and a pricing table (list prices on the in-app page: Solo $29, Growth $79, Agency $149).
- **Upgrade by contacting the team** (no payment processor yet).
- A **limit-reached modal** appears when adding a client over the plan limit.
- Public site: prices are shared with beta invitations; **beta members get a discounted price for the first 3 months**.

### 6.10 Trust and metric integrity (a differentiator)

Every metric has a definition, a calculation, a data source and a reliability flag in one shared metric layer.

| Shown | Definition |
|---|---|
| Emails sent | Campaign emails including follow-ups; warmup excluded |
| Prospects contacted | People who received email one (summed per campaign) |
| Human replies | Unique prospects who replied; automatic replies excluded |
| Positive | Prospects marked interested / meeting booked / completed / won in Instantly |
| Reply rate | Human replies ÷ prospects contacted |
| Positive rate | Positive ÷ prospects contacted |
| Emails per positive | Shown only from 5 positives |

| Deliberately **not** shown | Why |
|---|---|
| Open rate | Open tracking isn't reliable enough |
| Meetings | Not reliably reported by the sending platform |
| Revenue | Klaroh has no verified revenue data |
| Bounce rate | Unit not yet verified |

Also: low-volume warnings, minimum-sample rules for step analysis, no missing value silently turned into 0, and "not reported" states.

### 6.11 Security and privacy

- **Workspace isolation** by row-level security; tenancy derived from the parent row so a caller cannot write into another workspace.
- **API keys:** validated with the provider, encrypted with AES-256-GCM (random IV per record), readable only server-side, never returned to the browser.
- **Secure client links:** token-gated, rotatable, no-index, no-referrer.
- **Rate limiting** on sensitive endpoints via atomic database counters.
- **Cron endpoints** authenticated by a secret.
- **Auth proxy** gates everything except the landing page, auth pages, client portal and API routes (which check their own auth).
- **Test coverage:** unit tests (adapter, metrics, portal, replies, sync, encryption, cron auth), database security tests, and an end-to-end sync test against a real PostgREST/PostgreSQL stack.

### 6.12 Transactional email

Resend-powered: welcome email on signup, client invite with report link, and a logged audit trail (status, error, provider ID) for every outbound email.

### 6.13 Public website and content marketing

- **Landing page** (dark editorial design): problem section (five tabs → one view), interactive product tour built from real app screens, how-it-works, capability showcase, "what we show vs. don't show", FAQ, and a private-beta waitlist call to action.
- **SEO:** sitemap, robots, Open Graph image, JSON-LD structured data, Twitter card.
- **Resources hub** with three research-backed articles:
  1. *How to report Instantly campaign results to clients when every client has its own workspace*
  2. *Reply rate and positive reply rate numbers don't match: why*
  3. *Spreadsheet, Instantly portal, custom dashboard or Klaroh: how to choose a client reporting setup*
- **Marketing asset library:** desktop and mobile screenshots of every major screen (auth, overview, campaigns, inbox states, infrastructure, portal modes, settings) in `public/marketing/`.

### 6.14 Design and UX

- Material 3 token system: deep green `#003E2A` for actions, brand green `#0F573E` for data, Instrument Serif page titles, Inter body.
- Responsive from desktop sidebar to mobile bottom navigation with a "More" sheet.
- Skeleton loading states, error and not-found boundaries, accessible dialogs and keyboard handling.

---

## 7. Problem → feature map

| Pain | Klaroh answer |
|---|---|
| "I spend Fridays building client reports" | Private, always-current client portal with plain-language summary |
| "Clients keep asking for updates" | Self-serve link; at-a-glance view; conversations with interested prospects |
| "I find out a mailbox died after results tank" | Needs-attention list, mailbox flags, DNS/warmup checks, overview alerts |
| "My numbers don't match what the tool says" | One fixed definition per metric, shown on hover; unverifiable metrics hidden |
| "I can't tell which campaign to scale" | Cross-client campaign comparison, rankings, step-level analysis |
| "Replies are scattered across clients" | Unified inbox filtered by client, positive-only view |
| "I need to show ROI" | Cost, cost per positive response, value per positive response |
| "Every client has their own workspace" | One connection, one view across clients |
| "I don't want clients seeing each other's data or my account" | Per-client token links, selectable figures, rotation |
| "Is this safe with my API key?" | Validated, encrypted, server-only, disconnect purges it |

## 8. Differentiators for messaging

1. **Honesty over vanity metrics:** the only reporting tool that tells you what it won't show, and why.
2. **Agency-first, not generic BI:** onboarding is "connect, select, share", not "build a dashboard".
3. **Operations plus reporting in one product:** results, replies and sending health together.
4. **Read-only and complementary:** it sits beside Instantly rather than replacing it, which lowers adoption risk.
5. **Client-readable language:** definitions and summaries a business owner understands.

## 9. Current boundaries (be upfront in sales conversations)

- **Instantly only** for now; Smartlead is planned.
- **Not real-time:** scheduled syncs with visible freshness.
- **Read-only:** no sending, no reply-from-Klaroh.
- **Billing is manual** (contact to upgrade); no payment processor yet.
- **Private beta:** invitation-based; automation and recommendations are future ideas, not shipped features.
- **Cross-campaign prospect counts** are per-campaign sums, not unique people (stated in the UI).
- **Retired from V1:** the remarks/updates feed, manual infrastructure signals and the Demo Data source are no longer part of the product.

## 10. Build history (how we got here)

| Phase | What shipped |
|---|---|
| **V1** | Agency dashboards, hand-entered campaign data and a remarks feed; slug-based public pages |
| **V2 foundation** | Workspaces and members; provider-neutral campaign model; Instantly sync with daily snapshots and sync log; encrypted integrations |
| **Onboarding** | Client onboarding flow (create → connect → select → import); provider campaign naming |
| **Analytics** | Shared metric layer; Overview, Campaigns and Infrastructure analytics; mailbox, warmup and domain health; sequence-step analysis; rankings and trend charts |
| **Reply inbox** | Reply sync, positive/human filters, conversation view |
| **Client portal** | Token-secured, configurable report with simple and detailed modes, economics, preview and link rotation |
| **Go-to-market** | New brand mark, redesigned landing page, SEO and share assets, resources hub with research articles, waitlist |

## 11. Suggested messaging blocks

**Headline options**
- *One view of every client's outbound.*
- *Stop rebuilding the client report.*
- *If we cannot verify a number, we do not show it.*

**Elevator pitch (30 seconds)**
"Klaroh is a read-only layer on top of Instantly for cold email agencies. Connect once, pick each client's campaigns, and you get an operations view of results, replies and mailbox health across every client, plus a private, branded report you can send each client. It uses one fixed definition for every metric and hides anything it can't verify, so the numbers hold up when a client asks about them."

**Proof points**
- Four steps from API key to client-ready report
- Daily automatic sync with visible last-synced time
- Seven core metrics with published formulas; four risky ones deliberately withheld
- Per-client rotatable links; AES-256-GCM key storage
- SPF / DKIM / DMARC / MX and warmup health beside campaign results
