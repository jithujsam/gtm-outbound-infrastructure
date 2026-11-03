# PRODUCT BIBLE — KLAROH

## Section 1: Product Overview

**Klaroh** is a client visibility platform that helps lead generation agencies share real-time campaign performance with their clients through branded dashboards. Instead of manual reports, agencies create a live dashboard for each client that shows campaign metrics (emails sent, open rates, reply rates, leads generated), email infrastructure health (sending capacity, active inboxes, domain health), and a formal communication thread (remarks). Clients receive a shareable link to view their dashboard without logging in. Agencies maintain a subscription with a free 14-day trial, then select a paid plan (Solo: 3 clients, Growth: 10 clients, Agency: 20 clients).

**Who uses it:**
- **Agencies** (the builders) — sign up, create clients, view all dashboards, post updates, manage settings and billing
- **Clients** (the viewers) — receive a shareable link, see their campaign metrics, view updates, post questions/replies

**The Three Layers:**

1. **Visibility** — Real-time campaign metrics on the public client dashboard showing leads by week, email volumes, open rates, reply rates, and email infrastructure health signals
2. **Communication** — A remarks system where agencies post structured updates (Weekly Review, Campaign Update, Lead Report, Issue Flagged, etc.) and clients can reply
3. **Intelligence** — (Planned v2) AI-generated summaries of campaign performance and recommendations

---

## Section 2: User Journeys

### **Agency User Journey**

#### Step 1: Sign Up
- Navigate to [klaroh.app](https://klaroh.app)
- Click "Create account"
- Enter agency name, website (optional), work email, password (min 8 characters)
- Accept Terms of Service
- Submit → account created, 14-day free trial begins
- Onboarding email sent confirming account
- Redirected to dashboard

#### Step 2: Create First Client
- On dashboard, click "Create Client"
- Enter client name (e.g., "Acme Corp")
- Slug auto-generated from name (e.g., "acme-corp") or edit manually
- Optionally enter client email → dashboard link sent immediately
- Submit → client created, appears in your client list

#### Step 3: Connect Data Source (Create Campaign)
- Click into client to view their dashboard
- Click "Create Campaign" or the plus icon
- Enter campaign name
- Choose integration: "Demo Data" or "Smartlead API"
  - **Demo Data:** System generates realistic metrics instantly (2000–4000 emails, 45–60% open rate, 5–10% reply rate, growing weekly leads)
  - **Smartlead API:** Paste your API key (acquired from smartlead.com), then metrics sync from your live Smartlead account
- Campaign created → dashboard now shows campaign metrics

#### Step 4: View Client Dashboard
- Client dashboard displays:
  - 4 stat cards: Leads Generated, Emails Sent, Open Rate, Reply Rate
  - Line chart showing leads generated week-by-week
  - Email infrastructure signals (Sending Capacity, Active Inboxes, Domain Health)
  - Latest remarks/updates from you
  - Edit button for each signal (sending capacity, etc.)

#### Step 5: Post Remarks (Updates)
- Click "Post Update" or the plus icon in the remarks section
- Select category (Weekly Review, Campaign Update, Lead Report, Issue Flagged, etc.)
- Enter title and details
- Optionally attach a file (PDF, PNG, JPG, DOCX — max 10 MB)
- Submit → update posted, appears at top of remarks timeline
- If client email on file → notification email sent automatically

#### Step 6: Check Billing & Plan Status
- Go to Settings → Billing
- Current plan shown (e.g., "Trial" with 5 days remaining)
- Client count usage displayed (e.g., "3 of 3 clients")
- Pricing table shows what each plan includes
- To upgrade, click the tier → email sent to hello@klaroh.app

#### Step 7: Manage Settings
- **General:** Update agency name, website, timezone, upload logo
- **Account:** Change email, password, full name
- **Integrations:** Connect or disconnect Smartlead API
- **Billing:** View plan, remaining trial days, upgrade options

---

### **Client User Journey**

#### Step 1: Receive Dashboard Link
- Agency creates your account in Klaroh, enters your email
- Email arrives: "Your campaign dashboard is ready"
- Click "View your dashboard" → public dashboard opens (no login required)

#### Step 2: View Campaign Metrics
- Dashboard shows agency branding (logo, name)
- Your name displayed at the top
- 4 metric cards: Leads Generated, Emails Sent, Open Rate, Reply Rate
- Line chart showing leads generated across 4 weeks
- Email infrastructure metrics (Sending Capacity, Active Inboxes, Domain Health)
- All data updates live as campaigns progress

#### Step 3: Browse Remarks
- Click "Remarks" tab to see updates from your agency
- Timeline shows updates in reverse chronological order (newest first)
- Each update shows category (Weekly Review, Lead Report, etc.), title, body, timestamp, and who posted it (Agency or Client)
- File attachments can be downloaded

#### Step 4: Post Your Own Remarks (Optional)
- On Remarks tab, click "Post Update" or plus icon
- Select category, enter title and details
- Optionally attach a file
- Submit → your remark posted with "Client" author badge
- If agency email on file → notification sent to them

#### Step 5: Switch Between Campaigns
- If client has multiple campaigns, use dropdown at top of dashboard
- Select campaign → metrics update to show that campaign's data
- Remarks can be filtered by campaign or shown as "General" (all campaigns)

---

## Section 3: Pages & Features

### Authentication Pages

#### **Login** (`/auth/login`)
**For:** New or returning agencies
**What it does:** Sign into your account with email and password. You can also reset a forgotten password from here.
**What you accomplish:** Access your dashboard and all your client data.

#### **Sign Up** (`/auth/signup`)
**For:** New agencies
**What it does:** Create a new account by providing your agency name, website, email, and password. You get a 14-day free trial automatically.
**What you accomplish:** Start managing clients and sharing dashboards immediately.

#### **Reset Password** (`/auth/reset-password`)
**For:** Agencies who forgot their password
**What it does:** Enter your email address. A reset link is sent to you (valid for 1 hour).
**What you accomplish:** Reset your password without contacting support.

#### **Reset Password Confirm** (`/auth/reset-password-confirm`)
**For:** Agencies resetting a password
**What it does:** Set your new password via the link you received in your email.
**What you accomplish:** Regain account access.

---

### Authenticated Pages (Agencies Only)

#### **Dashboard** (`/dashboard`)
**For:** Agencies
**What it does:** Displays all your clients in one list. You can see how many active campaigns each has, when they were last updated, and whether they're active, paused, or ended.
**What you accomplish:** Get a quick overview of all your client relationships; click any client to dive into their details.

#### **Client Detail** (`/clients/[slug]`)
**For:** Agencies
**What it does:** Shows the full client dashboard with campaign metrics, email infrastructure signals, remarks, and controls to edit campaigns or post updates.
**What you accomplish:** Manage one client's data, send them updates, and monitor their campaign health in detail.

#### **Remarks Browser** (`/remarks`)
**For:** Agencies
**What it does:** Shows all your clients as cards. Click any client to see and manage their remarks timeline.
**What you accomplish:** Quickly navigate to a client's communication history.

#### **Settings** (accessed via modal in sidebar/bottom nav)
**For:** Agencies
**What it does:** Four sections — General (agency name, logo, timezone), Account (email/password), Integrations (connect Smartlead), Billing (view plan, trial days, upgrade).
**What you accomplish:** Customize your account, connect data sources, and manage your subscription.

#### **Billing** (`/settings/billing`)
**For:** Agencies
**What it does:** Displays three pricing tiers (Solo $29, Growth $79, Agency $149) with client limits and features per tier. Shows contact CTA to upgrade.
**What you accomplish:** Understand pricing, see what each plan includes, and request an upgrade.

---

### Public Pages (No Login Required)

#### **Public Client Dashboard** (`/c/[slug]`)
**For:** Clients (anyone with the link)
**What it does:** Shows campaign metrics (Leads, Emails Sent, Open Rate, Reply Rate), weekly leads chart, email infrastructure health, remarks from the agency, and an option to post your own updates.
**What you accomplish:** Monitor your campaign performance and communicate with your agency in real time.

---

## Section 4: Capabilities Matrix

| Capability | Who | Where | Requires |
|---|---|---|---|
| Create an account | Agency | Sign Up page | Email, password, agency name |
| Sign in to account | Agency | Login page | Email, password |
| Reset forgotten password | Agency | Reset Password page | Email address |
| Create a new client | Agency | Dashboard → Create Client | Agency login, plan allows (not at limit) |
| Edit client name, slug, or email | Agency | Client detail → Edit icon | Agency login, client ownership |
| Delete a client | Agency | Client detail → Delete | Agency login, client ownership |
| Create a campaign for client | Agency | Client detail → Create Campaign | Agency login, integration (Demo or Smartlead) |
| Edit campaign name | Agency | Client detail → Campaign menu | Agency login, client ownership |
| Delete a campaign | Agency | Client detail → Campaign menu | Agency login, client ownership |
| View campaign metrics | Agency & Client | Client dashboard | Agency login (agency) / public link (client) |
| View email infrastructure signals | Agency & Client | Client dashboard | Agency login (agency) / public link (client) |
| Edit email infrastructure signals | Agency | Client dashboard → Edit icons | Agency login, client ownership |
| Upload agency logo | Agency | Settings → General | Agency login, file (PNG/JPG/WEBP, max 2 MB) |
| Post a remark/update | Agency & Client | Client detail or public dashboard, Remarks section | Agency login (agency) / public link (client) |
| Attach a file to remark | Agency & Client | PostRemarkForm | File (PDF/PNG/JPG/DOCX, max 10 MB) |
| View remarks timeline | Agency & Client | Client detail or public dashboard, Remarks tab | Agency login (agency) / public link (client) |
| Filter remarks by campaign | Agency & Client | Client detail, Remarks tab dropdown | Agency login (agency) / public link (client) |
| View settings | Agency | Settings modal (sidebar/bottom nav) | Agency login |
| Update agency info (name, website, timezone) | Agency | Settings → General | Agency login |
| Change account email or password | Agency | Settings → Account | Agency login |
| Connect Smartlead API | Agency | Settings → Integrations | Agency login, Smartlead API key |
| Disconnect Smartlead API | Agency | Settings → Integrations | Agency login |
| View current plan and client usage | Agency | Settings → Billing | Agency login |
| View remaining trial days | Agency | Settings → Billing (if on trial) | Agency login |
| Upgrade plan | Agency | Settings → Billing → Contact CTA | Email to hello@klaroh.app |

---

## Section 5: API Routes (For Reference)

### Client Management

**POST `/api/create-client`**
- **What happens:** Creates a new client record. Validates the slug for uniqueness and format. Enforces plan limits (trial: 3, basic: 3, standard: 10, pro: 25). If email provided, sends an invite email with the public dashboard link.
- **Who can use it:** Authenticated agencies only
- **What it touches:** `clients` table, `agency_details` table (for plan check), `email_logs` table (for email record)

**POST `/api/update-client-name`**
- **What happens:** Updates client name, slug, and optional email. Validates slug uniqueness (unless unchanged).
- **Who can use it:** Authenticated agencies only (validated to own the client)
- **What it touches:** `clients` table

**POST `/api/update-client-status`**
- **What happens:** Sets client status to 'active', 'paused', or 'ended'.
- **Who can use it:** Authenticated agencies only
- **What it touches:** `clients` table

**POST `/api/delete-client`**
- **What happens:** Deletes a client and all associated campaigns and remarks (cascading delete).
- **Who can use it:** Authenticated agencies only
- **What it touches:** `clients`, `campaigns`, `remarks` tables (cascade)

### Campaign Management

**POST `/api/edit-campaign`**
- **What happens:** Renames a campaign.
- **Who can use it:** Authenticated agencies only
- **What it touches:** `campaigns` table

**POST `/api/delete-campaign`**
- **What happens:** Deletes a campaign and its remarks.
- **Who can use it:** Authenticated agencies only
- **What it touches:** `campaigns`, `remarks` tables (cascade)

### Remarks & Communication

**GET `/api/remarks?client_id=...&campaign_id=...`**
- **What happens:** Fetches remarks for a client and optionally a specific campaign. Authenticated requests use RLS (read only own agency's remarks). Public requests use a scoped SECURITY DEFINER function.
- **Who can use it:** Authenticated agencies + public clients
- **What it touches:** `remarks` table (read-only via RLS or RPC)

**POST `/api/remarks`**
- **What happens:** Creates a new remark. `author_type` is derived from session (agency or client). Validates title (max 200 chars) and body (max 10,000 chars). If agency posts and client email on file, sends notification email.
- **Who can use it:** Authenticated agencies + public clients (rate-limited: agencies 120/hr, public 10/hr)
- **What it touches:** `remarks`, `email_logs` tables

**POST `/api/remarks/upload`**
- **What happens:** Uploads a file attachment (PDF, PNG, JPG, DOCX — max 10 MB) to the `remark-attachments` storage bucket. Returns the public URL.
- **Who can use it:** Authenticated agencies + public clients (rate-limited)
- **What it touches:** Supabase Storage bucket `remark-attachments`

### Settings & Integrations

**POST `/api/upload-logo`**
- **What happens:** Uploads an agency logo (PNG, JPG, WEBP — max 2 MB) to the `agency-logos` storage bucket. Returns the public URL. Auto-creates bucket if missing.
- **Who can use it:** Authenticated agencies only
- **What it touches:** Supabase Storage bucket `agency-logos`

**POST `/api/sync-smartlead`**
- **What happens:** [Placeholder] Simulates a Smartlead data sync. Currently returns success with 0 leads imported. Future version will fetch real data from Smartlead API.
- **Who can use it:** Authenticated agencies only
- **What it touches:** (Currently no-op; future version will update `campaigns` table)

### Plan & Subscription

**GET `/api/plan-status`**
- **What happens:** Returns the agency's plan, client count, plan limit, trial expiration status, and days remaining. Checks if trial has expired (14 days from account creation). Returns `effectivePlan` (if trial expired, basic; otherwise original plan).
- **Who can use it:** Authenticated agencies only
- **What it touches:** `agency_details`, `clients` tables (read-only)

### Email

**POST `/api/send-onboarding-email`**
- **What happens:** Sends a welcome email to a new agency upon signup. Rate-limited (5/hr by IP).
- **Who can use it:** Public (rate-limited)
- **What it touches:** `email_logs` table

---

## Section 6: Data & Storage

### Core Data Types

**Clients**
- The companies your agency manages
- Fields: name, slug (unique URL identifier), status (active/paused/ended), client email, email infrastructure signals
- One client per dashboard shared with that company
- Used by: agencies (CRUD), clients (view via public dashboard)

**Campaigns**
- Outreach efforts for each client (e.g., "Q3 Enterprise Campaign")
- Fields: name, emails sent, open rate, reply rate, positive reply rate, leads generated (sum of weekly), weekly breakdown (Week 1–4 leads), data source (demo or Smartlead)
- Multiple campaigns per client supported
- Metrics auto-calculated (leads_generated = week_1 + week_2 + week_3 + week_4)
- Used by: agencies (CRUD + view), clients (view via public dashboard)

**Remarks**
- Updates and communication between agency and client
- Fields: category (Weekly Review, Campaign Update, Lead Report, Strategy Change, Issue Flagged, Client Request, General), title, body, author type (agency or client), optional file attachment, created timestamp
- Append-only: never edited or deleted once posted
- Optional campaign scoping: null = general/across-campaign, or campaign_id = scoped to one campaign
- Used by: agencies (post + read), clients (post + read via public link)

**Files (Attachments)**
- PDFs, PNGs, JPGs, DOCXs attached to remarks
- Stored in Supabase Storage bucket `remark-attachments` (public, so clients can download without auth)
- Max 10 MB per file
- Referenced by remarks via `attachment_url` and `attachment_name`

**Plan & Trial**
- Every agency starts on a 14-day free trial (no credit card)
- After 14 days, plan defaults to "basic" (3 client limit)
- Paid plans: solo ($29, 3 clients), growth ($79, 10 clients), agency ($149, 20 clients)
- Plan enforced server-side on `/api/create-client`
- No Stripe integration; upgrades via email contact

---

## Section 7: Security & Privacy

### Authentication & Authorization

**Login:**
- Email + password via Supabase Auth
- Session cookies managed server-side via `@supabase/ssr`
- Middleware (edge) + per-page checks enforce auth on all authenticated routes

**Data Access Control (RLS):**
- Each agency can only see and modify their own clients, campaigns, remarks
- Scope via: user_id → agency_details → owned resources (clients, campaigns, remarks)
- Example: Agency A cannot list or modify Agency B's clients

**Public Client Dashboard:**
- No login required for `/c/[slug]` — designed to be shareable
- Data scoped via SECURITY DEFINER RPC functions: `get_public_campaign_data(client_id)`, `get_public_client_by_slug(slug)`, etc.
- These functions run as the database owner (not the requesting user) but only return data for a single `client_id` — preventing enumeration of all clients

### Encryption & Storage

**API Key Encryption:**
- Smartlead API keys encrypted with AES-256-GCM before storage
- Random IV per key; authentication tag detects tampering
- Decryption key derived from `ENCRYPTION_KEY` env var
- Legacy keys (crypto-js encrypted) auto-migrated on read

**File Storage:**
- Attachments stored in public Supabase Storage buckets (agencies can share links)
- No sensitive data in attachments (client responsibility)
- MIME type validated on upload (server-side); file contents not re-scanned

### Rate Limiting

**Authenticated Routes:**
- `/api/create-client`: 30 per agency per hour
- `/api/remarks` (POST): 120 per agency per hour
- `/api/generate-summary`: 10 per user per hour
- `/api/send-onboarding-email`: 5 per IP per hour

**Public Routes:**
- `/api/remarks` (POST from public client): 10 per IP per hour
- `/api/remarks/upload` (public): 10 per IP per hour

Rate limits enforced via atomic counters in the `rate_limits` table (Postgres backend).

### Data Isolation & Privacy

- **Agencies see only their own data** — clients, campaigns, remarks, email logs
- **Clients see only one dashboard** — scoped to their public slug
- **Remarks are append-only** — no edits/deletes once posted (creates audit trail)
- **Email logs are user-scoped** — users can read their own logs only

### Known Security Notes

1. **No edge-level auth middleware** — `src/proxy.ts` exists but is not called (no middleware.ts). Authenticated routes rely on per-page server-side checks.

2. **Public remark insertion** — Anon (public client) can INSERT remarks with `author_type='client'` for any `client_id` without explicit opt-in from the agency. Rate limiting (10/hr by IP) mitigates abuse. Consider adding a secret token per client to prevent spam on random client IDs.

3. **File upload MIME type spoofing** — Supabase Storage does not re-validate Content-Type on the server side. A malicious file could claim to be `.pdf` but contain arbitrary data. Consider scanning uploads server-side if sensitive.

4. **Hardcoded test email sender** — Emails hardcode `from_email: 'onboarding@resend.dev'` (Resend's shared test sandbox). Verify the `klaroh.app` domain in Resend and update the hardcoded address before production launch.

5. **Encryption key as single point of failure** — If `ENCRYPTION_KEY` leaks, all stored Smartlead keys are compromised. Rotate the key and re-encrypt all values before production.

---

## Section 8: Known Limitations & Future Work

### Intentionally Not Built (v1 Scope)

- **Layer 3 Intelligence** — AI-generated summaries and recommendations (partially built; OpenAI integration exists but `summaries` table no longer exists)
- **Instantly.ai integration** — No support yet; only Smartlead or demo data
- **Stripe payment processing** — Upgrades handled via email contact
- **Custom branding per agency** — All dashboards use Klaroh branding (logo upload only; colors not customizable)
- **Multi-user agencies** — One user per agency account; no team/permission model
- **Scheduled reports** — No email digests or scheduled summaries
- **Two-way sync with Smartlead** — Campaign metrics fetched on-demand, not continuously synced

### Known Issues & Workarounds

- **Smartlead sync placeholder** — `/api/sync-smartlead` returns success with 0 leads. Campaigns must be created manually with "Smartlead" integration type; metric updates not yet automated.

- **Demo data is static** — Demo campaign metrics are hardcoded random values generated at campaign creation. Metrics don't evolve over time. Useful for testing, not for realistic long-term tracking.

- **Resend domain not verified** — Until you verify `klaroh.app` domain in Resend, all emails use the shared sandbox sender (`onboarding@resend.dev`). Production email delivery requires domain verification.

- **Storage buckets manual creation** — `remark-attachments` bucket must be created manually in Supabase dashboard. `agency-logos` is auto-created on first upload.

- **Trial enforcement is honor-based in UI** — Trial expiration is checked server-side in `/api/plan-status`, but the UI doesn't block non-paying agencies from continuing to use the app. Paid features (beyond 3 clients) are enforced only at the API level.

- **Remarks are immutable** — No edit or delete functionality, by design. If a remark is posted with a typo or error, it cannot be corrected; a new remark must be posted.

- **Email notifications are best-effort** — If Resend is unavailable, email sends fail silently. The remark still posts (email failure doesn't block the API call).

### Deferred/TODO

- **Chart hardcoding** — Campaign metrics chart uses hardcoded hex color values; not yet using design tokens
- **Font mismatch** — `layout.tsx` loads Merriweather (serif) but design system specifies Instrument Serif; not currently used
- **Edge-level auth middleware** — `src/proxy.ts` exists but needs `middleware.ts` to activate (would redirect unauthenticated users to `/auth/login` at the edge)
- **API key rotation/re-encryption** — Current encryption uses a single `ENCRYPTION_KEY` env var; future version should support key rotation and re-encryption of old values

---

## Appendix: Feature Checklist

### v1 (Current)

✅ Agency signup + 14-day trial  
✅ Client management (create, edit, delete)  
✅ Campaign creation (demo or Smartlead source)  
✅ Public client dashboard (no login)  
✅ Campaign metrics visualization  
✅ Email infrastructure signals (editable)  
✅ Remarks / communication thread  
✅ File attachments on remarks  
✅ Remarks filtering by campaign  
✅ Agency settings (name, logo, timezone, password)  
✅ Smartlead API key storage (encrypted)  
✅ Plan enforcement (trial + 3 paid tiers)  
✅ Email notifications (invite, onboarding, remarks)  
✅ Rate limiting (API routes)  

### v2 (Planned)

⏳ Layer 3 Intelligence (AI summaries)  
⏳ Instantly.ai integration  
⏳ Smartlead live sync (auto-update metrics)  
⏳ Stripe payment processing  
⏳ Team/multi-user per agency  
⏳ Custom agency branding (colors, fonts)  
⏳ Scheduled email reports  

---

**Last Updated:** 2026-06-11  
**Contact:** hello@klaroh.app
