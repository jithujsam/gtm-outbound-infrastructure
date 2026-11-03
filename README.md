# GTM Engineering Portfolio

I build systems for outbound and revenue operations, combining hands-on GTM experience with software, data pipelines, API integrations, and workflow automation.

This repository contains selected projects and supporting workflow definitions. They are related to the same operational problems, but they are **not one fully integrated end-to-end platform**. Each project's status and limitations are called out below.

## Repository Layout

```
apps/
  gtm-validate/        Lead import, ICP scoring and email verification (Next.js + Supabase)
  klaroh/              Klaroh: agency campaign visibility and client portals (Next.js + Supabase)
workflows/             Importable n8n workflow definitions
  signal-to-pipeline/  Job-signal scraping, lead sourcing, ICP validation
  outbound-engine/     AI-rewritten sends with self-hosted open tracking
site/                  Personal website and CV (static HTML, deployed separately)
```

Each app is self-contained: its own `package.json`, lockfile, Supabase migrations, `.env.example` and README. CI (`.github/workflows/ci.yml`) typechecks, tests and builds both apps on every push.

## Featured Projects

### 1. GTM Validate — Lead Data Processing

**Code:** [apps/gtm-validate](apps/gtm-validate/README.md)

A Next.js application for importing lead lists, scoring ICP fit, validating email addresses, and reviewing results.

**Implemented capabilities**
- CSV import, column mapping, and a spreadsheet-style lead review interface.
- OpenAI structured-output ICP classification with an editable, per-project criteria prompt.
- Clearout email verification with provider rate-limit handling.
- PostgreSQL-backed job processing with lease-based claiming, atomic result writes, retries, and API cost logging.
- Supabase authentication and row-level security.

**Engineering focus:** asynchronous processing, database-backed queues, provider failures, retry behaviour, API cost visibility, and data ownership.

**Quality checks:** strict TypeScript enforced at build time, and unit tests (Vitest) on the retry, rate-limit, Clearout parsing, cost, and input-whitelisting logic, all run in CI on every push. The migrations apply cleanly to a fresh PostgreSQL database.

**Known gaps:** no integration tests yet for the job processor against a real database, the database changes have not been verified against a live staging Supabase project, and there is no CSV export yet. These are active engineering tasks, not claims of production readiness.

### 2. Klaroh — Agency Operations and Client Visibility

**Code:** [apps/klaroh](apps/klaroh/README.md) · **Product:** [klaroh.online](https://klaroh.online) · [Open the app](https://app.klaroh.online)

Klaroh helps cold-email and lead-generation agencies monitor campaign performance across clients and share a branded report with each client, without giving clients access to the agency's sending tools.

**What it includes**
- Cross-client campaign overview and campaign comparisons.
- A unified inbox for prospect replies.
- Sending infrastructure views for mailboxes, warmup, capacity, and domain DNS checks.
- Branded client portals with configurable visibility and rotatable secret links.
- Instantly integration, scheduled and on-demand sync, and sync history.
- Workspace membership, server-side authorization, PostgreSQL row-level security, encrypted provider credentials, and API rate limiting.

**Engineering focus:** provider API integration, normalized data models, scheduled synchronization, tenant isolation, secure client-facing reports, metric definitions, and operational visibility.

**Current scope:** private beta. Instantly is the only working sending-tool integration. Klaroh reads campaign data; it does not send email. Data is synced rather than live, and some metrics are deliberately withheld when their source cannot be verified. Billing upgrades are handled manually; there is no payment processor.

**Quality checks:** strict TypeScript, 230 unit tests (Node test runner), SQL tests for the portal functions, and an end-to-end sync test, documented in [apps/klaroh/README.md](apps/klaroh/README.md).

`apps/klaroh` is a copy of the Klaroh application source. Product documentation lives in [apps/klaroh/docs](apps/klaroh/docs/README.md).

### 3. Outbound Workflow Automation

These are importable n8n workflow definitions, not hosted products.

- **[Signal-to-Pipeline](workflows/signal-to-pipeline/README.md):** job-signal discovery, lead sourcing, ICP scoring, and staged email verification.
- **[Outbound Engine](workflows/outbound-engine/README.md):** AI-assisted email rewriting, controlled sending cadence, and open-event tracking.

Running these workflows requires n8n and the third-party accounts and credentials documented in their individual READMEs.

## Technical Areas Demonstrated

| Area | Evidence |
|---|---|
| GTM operations | Prospecting signals, ICP qualification, outbound workflows, client reporting |
| Web applications | Next.js, React, TypeScript, Tailwind CSS |
| Data and databases | PostgreSQL, Supabase, schema migrations, RLS, database functions |
| APIs and integrations | Instantly, Clearout, OpenAI, Gemini (n8n), Apify, Airtable, Resend |
| Reliability | Job leases, retries, rate limits, atomic writes, sync status and error logging |
| Security | Workspace authorization, row-level security, encrypted provider keys, scoped public client links |
| Automation | Importable n8n workflows and scheduled jobs |

## Running Locally

| Project | Setup |
|---|---|
| GTM Validate | `cd apps/gtm-validate`, then follow [its README](apps/gtm-validate/README.md): Supabase project, apply `supabase/migrations`, add OpenAI and Clearout keys in the app. |
| Klaroh | `cd apps/klaroh`, then follow [its README](apps/klaroh/README.md): Supabase project, migrations, `.env.local` from `.env.example`. |
| Workflows | Import the JSON into n8n and replace the `YOUR_*` placeholders (see each workflow README). |
| Site | Static files in `site/`; see [site/README.md](site/README.md). |

## Honest Scope

This repository is a portfolio of related GTM engineering work, not a single production system connecting every stage. The workflow exports need external services, GTM Validate still needs integration tests, and Klaroh is a private-beta product whose current scope is documented above.

For setup instructions, use each project's README. Do not commit API keys, service-role credentials, real prospect data, or customer data.

---

[LinkedIn](https://in.linkedin.com/in/jithujsam)
