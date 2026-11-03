# Klaroh database

## Source of truth

`supabase/migrations/` — timestamped, ordered, non-destructive files in the Supabase CLI layout.

| File | What it is |
|---|---|
| `20260101000000_baseline_v1.sql` | Flattened end state of the legacy hand-run files `01…25`. **For brand-new databases only.** |
| `20260101000100_security_hardening_v1.sql` | Forward security fixes. Idempotent and safe on production. |
| `20261006000100_v2_workspaces.sql` | **V2 phase 1** — `workspaces` + `workspace_members`; one workspace per agency (same id), its user as owner; `workspace_id` on clients/integrations/remarks/V1 campaigns. |
| `20261006000200_v2_workspace_identity.sql` | **V2 phase 2** — `ensure_workspace()`; RLS by workspace membership; `provider` on integrations. |
| `20261006000300_v2_campaign_foundation.sql` | **V2 phase 3** — `campaigns_v2`, `campaign_stats`, `campaign_client_map`, `sync_runs`, `campaign_legacy_map`; `get_client_campaigns()`. |
| `20261006000400_v2_instantly_backfill.sql` | **V2 phase 4** — every V1 Instantly campaign → V2 (+ snapshot, client links, legacy map); remarks re-pointed. |
| `20261006000500_v2_public_portal.sql` | **V2 phase 5** — public portal functions on V2. |
| `20261006000600_v2_retire_v1.sql` | **V2 phase 6** — V1 tables become a read-only archive; dead demo functions dropped. **Apply after deploying the V2 app.** |
| `20261007000100_client_onboarding_integrations.sql` | **Client onboarding** — integration credentials become server-only (users can no longer read `api_key_encrypted` or write `integrations`); `integrations.has_credential`; `campaigns_v2.unavailable_since`. **Apply together with the onboarding app deploy** (see below). |

The legacy hand-run files (`01…25_*.sql`, `schema.sql.archive`, `seed.sql`, `demo_data*.sql`, `diagnose_instantly_campaigns.sql`)
were removed; they are in git history and the baseline migration is their flattened end state. **Never run them.**

## Folder map

| Path | Purpose |
|---|---|
| `migrations/` | Source of truth (Supabase CLI layout). |
| `manual-apply/v2/` | The V2 migrations split into SQL-Editor-sized parts `01…18` (for the existing production DB). |
| `manual-apply/v1/` | **Historical, never run again.** The V1 security-fix parts; kept only because `tests/run.sh` proves they equal the migration. |
| `verify/` | `v2_migration_check.sql`, `onboarding_check.sql` (read-only post-apply checks) and schema fingerprints. |
| `tests/` | Throw-away-database SQL tests (`npm run db:test`), the sync e2e test (`npm run e2e:test`) and the browser check of the analytics pages (`npm run browser:test`, needs PostgREST + Chromium). |

**Production status:** V2 parts `01…12` were applied on 2026-10-06 and `verify/v2_migration_check.sql` passed (every row `ok = true`).
Part `13` (client onboarding) is applied. Part `14` (provider campaign names) — see "Provider campaign names (part 14)" below.
Part `15` (outbound analytics + infrastructure) — see "Outbound analytics (part 15)" below.
Part `16` (deleting really deletes) — see "Deleting clients and campaigns (part 16)" below.
Part `17` (secure client portal + campaign economics) — see "Client portal (part 17)" below.
Part `18` (prospect replies / Inbox) — see "Inbox (part 18)" below.
Part `19` (no default "Healthy" domain status) — see "Domain health default (part 19)" below. **Not yet applied.**

## Domain health default (part 19)

`20261010000100_client_domain_health_default.sql` / `manual-apply/v2/19_client_domain_health_default_1of1.sql`.
Drops the `'Healthy'` default of `clients.domain_health_status` (a label the agency types in), so a new client no
longer looks healthy before anything was entered; it starts as `null` and the app shows "—". Existing rows are not
changed. No table, function or policy changes. Can be applied before or after deploying the app. Safe to re-run.

## Inbox (part 18)

`20261008000400_reply_inbox.sql` / `manual-apply/v2/18_reply_inbox_1of1.sql`. Additive; nothing is dropped.

| Object | What it is |
|---|---|
| `reply_threads` | One per provider conversation (unique integration + provider thread id) of a client-linked campaign: prospect, campaign, the lead's interest status at the provider, and aggregates (human replies, auto-replies, last human reply, snippet) kept by trigger. |
| `reply_messages` | One per message a prospect sent (unique integration + provider message id); readable text with quoted history removed (≤ 20,000 chars); `is_auto_reply`. The agency's own outbound emails are not stored. |
| `reply_sync_runs` | The reply sync's own run log (separate from `sync_runs`, so campaign sync status is unchanged). A unique index allows one running reply sync per integration. |
| `reply_sync_state` | Per integration: the window being fetched and the provider cursor, so a sync stopped by the rate limit continues where it stopped. |
| `client_portals.show_conversations` | The client sees "Conversations with interested prospects" (default on). |
| `get_client_portal_conversations(token)` | Token-authorized: the client's positive conversations (interested, meeting booked, meeting completed, won — the statuses the positive metric counts) with the prospect's non-automatic replies. No internal or provider ids. |

Workspace-member RLS, workspace derived by trigger, no user deletes, no anon access. Deleting a campaign (part 16) deletes
its conversations. Apply part 18 before deploying the app that reads these tables. Safe to re-run.

## Client portal (part 17)

`20261008000300_client_portal.sql` / `manual-apply/v2/17_client_portal_1of1.sql`. Additive; nothing is dropped and no data
is deleted.

| Object | What it is |
|---|---|
| `client_portals` | One per client (created for every existing client, and by trigger for new ones): a random 64-hex `access_token` (the portal's authorization), the view the report opens on, the KPI cards in order, the campaigns in the report (`null` = all) and two section switches. Members can read it and update the settings columns only; the token changes only through `rotate_client_portal_token(client_id)`. |
| `campaign_economics` | Per client × campaign: `currency` (ISO code, required), `cost`, `value_per_positive` — entered by the agency, never synced. Deleted with the campaign ↔ client link. |
| `get_client_portal(token)` | The only public read. Token → that client's report (campaign figures, daily history, infrastructure status without addresses/domains, economics, branding). Inactive client → status only. |

**Security change:** the slug-based portal functions (`get_public_client_by_slug`, `get_public_campaigns`,
`get_public_client_campaigns`, `get_public_workspace_branding`) and the public remark functions (`get_public_remarks`,
`post_public_remark`) are revoked from `anon` and `authenticated` — a guessable slug no longer opens a report. They stay
defined (and the `remarks` table keeps its data); the app no longer has remarks.

**Deploy order:** apply part 17, then deploy the app (the new app needs `get_client_portal`; once part 17 is applied, the
old app's `/c/<slug>` portal stops loading data). Old `/c/<slug>` links then show "This report has a new link" to clients,
and take signed-in agency members straight to the new private link. Send clients their new link from Clients → client →
**Client portal** (Copy link). Safe to re-run.

## Deleting clients and campaigns (part 16)

A campaign exists in Klaroh because a client uses it. After part 16, when a campaign loses its **last** client (removed
from the client, or the client deleted) the database deletes the campaign with its daily and step statistics. A campaign
another client still uses is kept. Remarks are kept (they move to the client's General timeline). Mailboxes no remaining
campaign sends from are deleted with their history, and DNS checks of domains no mailbox uses. Nothing changes in the
sending platform; importing the campaign again starts a fresh history. The part also deletes campaigns that are already
linked to no client. Safe to re-run; independent of the app deploy.

## Outbound analytics (part 15)

Additive only. Adds `campaigns_v2.sender_emails`, `sync_runs.details` and four tables, all with the V2 rules (workspace
derived by trigger, workspace-member RLS, no user deletes, no anon access):

| Table | One row per | Holds |
|---|---|---|
| `campaign_step_stats` | campaign × day × step × variant | lifetime step counters (sent, replies, opens, clicks, opportunities) |
| `email_accounts` | integration × mailbox | status, warmup status/score, daily limit, tracking domain — **no credentials** (a check constraint rejects secret keys in `provider_raw`) |
| `email_account_stats` | mailbox × day | campaign sends/bounces/replies and, in separate columns, warmup sent/inbox/spam/received |
| `email_domains` | integration × domain | SPF / DKIM / DMARC / MX checks |

Only mailboxes used by client-linked campaigns are stored. Apply part 15 **before** deploying the app that reads these
tables (the old app ignores them). Run the file in the SQL Editor; it is safe to re-run.

## Provider campaign names (part 14)

A provider-backed campaign is named by its provider; Klaroh never overrides it. Part 14 clears the retired
`campaigns_v2.display_name` overrides (the V1 names stay in `campaign_legacy_map.legacy_name`), keeps the column null with a
trigger, and makes the read models return `campaigns_v2.name` (refreshed by every sync). Only names change: campaign ids,
statistics and client links are untouched. It is independent of the app deploy order (the app no longer writes
`display_name`), safe to re-run, and `verify/provider_name_check.sql` should then return `ok = true` on every row.

## Applying the client-onboarding change (part 13)

The onboarding app and part 13 depend on each other: the new app reads `integrations.has_credential` (added by part 13), and
part 13 stops signed-in users from reading the stored key, which the previous app version did directly. Apply them together:

1. **Back up** (Dashboard → Database → Backups).
2. Run `supabase/manual-apply/v2/13_client_onboarding_integrations_1of1.sql` in the SQL Editor (safe to re-run).
3. **Immediately** merge/deploy the onboarding app. Between steps 2 and 3 the old app's Instantly sync and key settings stop
   working (dashboards still render their stored numbers); nothing is lost.
4. Run `supabase/verify/onboarding_check.sql` — every row should be `ok = true`.
5. Vercel picks up the renamed cron path (`/api/sync`, was `/api/sync-instantly`) from `vercel.json` on deploy.

Nothing is deleted. Rollback: `grant select, insert, update, delete on public.integrations to authenticated;` restores the old
access (the added columns are harmless to the old app).

**Sync scope from this release:** only provider campaigns linked to a client (`campaign_client_map`) are stored and synced.
Campaigns are imported per client from the onboarding flow; discovery of the provider account is transient (never stored).
A campaign removed from every client keeps its history and is no longer synced. A selected campaign the provider no longer
returns gets `campaigns_v2.unavailable_since` (history kept, shown as "No longer at provider").

New schema change = new file in `migrations/` named `YYYYMMDDHHMMSS_description.sql`. Never edit an applied file.

## Applying V2 to production (no CLI needed)

Everything below only **adds** tables/columns and copies data; nothing is deleted. The V1 tables stay as an archive.

1. **Back up:** Supabase Dashboard → Database → Backups.
2. In the Supabase **SQL Editor**, run the files in `supabase/manual-apply/v2/` **one at a time, in numeric order,
   `01` to `11`** (open each on GitHub → copy the whole file → paste into a new SQL Editor tab → Run → wait for "Success").
   They are the V2 migrations split into editor-sized pieces (a test proves the result is identical). Each is safe to run
   again. Messages such as *"… does not exist, skipping"* are normal. The live (old) app keeps working while you do this.
   If `03` stops with "Duplicate Instantly integrations exist for a workspace", tell the engineer.
   Do **not** combine parts into one paste: the SQL Editor can silently cut a long paste short and still run and keep
   the part it received. (If that ever happens, simply run the parts from `01` again — re-running is tested to be safe.)
3. Run `supabase/verify/v2_migration_check.sql`: every row should show `ok = true` (it changes nothing).
4. **Deploy the new app** (merge the V2 pull request; Vercel deploys it).
5. Check the app: log in, open the Command Center, a client, a campaign, the client's public `/c/<slug>` page, post a
   remark, press Sync, rename a campaign in Settings → nothing should look broken.
6. Run `supabase/manual-apply/v2/12_v2_retire_v1_1of1.sql` — this makes the V1 tables read-only. Run step 3 again.

**Do not** run the old `manual-apply/v1/part*.sql` files again after V2 — they would undo V2 changes. Parts 2 and 3 refuse to run
on a V2 database.

**Plans** now live on the workspace: `update workspaces set plan = 'growth' where id = '<workspace id>';`
(the workspace id of a migrated agency is the same as its old `agency_details.id`).

**Rollback:** until step 6, the old app version still works against the database (V1 tables are untouched and kept in step
with V2). After step 6, re-allow V1 writes with `grant insert, update, delete on public.campaigns, public.agency_details to authenticated;`
plus the old policies. No V1 row is ever deleted by these migrations.

### What the V2 back-fill does with existing data

| V1 data | V2 result |
|---|---|
| each `agency_details` row | one `workspaces` row (same id) + the user as `owner` |
| clients, integrations, remarks | kept as they are, plus `workspace_id` |
| an Instantly campaign (V1 row per client) | one `campaigns_v2` row per Instantly campaign; one `campaign_client_map` row per client it was on; the oldest V1 row's id is reused; the agency's own name is kept in `campaign_legacy_map.legacy_name` (part 14 retired it as a display override) |
| V1 metrics | one `campaign_stats` snapshot dated at the V1 sync time (values the V1 row did not have stay empty — never 0) |
| remarks on an Instantly campaign | point at the V2 campaign (original id kept in `remarks.legacy_campaign_id`) |
| demo / Smartlead campaigns (not real data) | **not** migrated; they stay in the V1 archive; remarks on them move to the client's General timeline (original id kept) |
| V1 `campaigns`, `agency_details` | untouched; read-only after step 6 |

## Production is NOT identical to the baseline (verified)

The fingerprint of the live database was compared with `verify/baseline.fingerprint.txt`. **They differ**, because production
evolved by hand and the legacy files cannot be replayed cleanly (e.g. `15_cleanup_user_id_columns.sql` errors on a clean database).
So **do not run `supabase migration repair` for the baseline** — it would record a history that is not true.

What production actually has, compared with the baseline:

| Difference on production | Risk | Handled by |
|---|---|---|
| `clients_public` and `campaigns_public` policies (`SELECT … USING (true)`) — anyone with the public anon key can read **every** client (incl. `client_email`) and campaign | **Security leak** | hardening migration, section 8 |
| `get_campaign_data()` is SECURITY DEFINER and callable by anon (unused now) | Security | hardening, section 9 (revoked) |
| `clients.status` only allows `active`/`inactive`; the app's Pause toggle writes `paused` and failed | Bug | hardening, section 10 |
| `agency_details.plan` allows `trial/solo/growth/agency` (baseline: `trial/basic/standard/pro`) | Plan limits fell back to 3 | code: `PLAN_LIMITS` now knows both |
| No `updated_at` on `clients`/`campaigns`; no `updated_at` triggers on clients/campaigns/integrations | None (app does not use them) | accepted drift |
| Stricter NOT NULL / defaults on several `campaigns` and `integrations` columns; extra generated column `campaigns.leads_generated_computed`; `campaigns.name` default `'Campaign'`; no `idx_campaigns_integration_id` | None known | accepted drift |
| Different bodies of the dead `generate_demo_data()` / `get_campaign_data()`; extra `rls_auto_enable()` (Supabase) and `update_updated_at_column()` | None | accepted drift |

Everything else — all public RPC bodies, `set_remark_agency_id`, `check_rate_limit`, remarks/email_logs/rate_limits, owner RLS policies —
matches the repository exactly.

`tests/prod_drift_fixture.sql` reproduces these differences on top of the baseline, and `run.sh` runs the full security suite on it, so the
migrations are tested against production's real shape, not only the idealised one.

## Applying the V1 security fixes to production (historical — already done)

1. **Back up:** Supabase Dashboard → Database → Backups.
2. In the Supabase **SQL Editor**, run the four files in `supabase/manual-apply/v1/` **one at a time, in this order**
   (open each file on GitHub → copy the whole file → paste into a new SQL Editor tab → Run → wait for "Success"):
   1. `part1_close_leaks_and_pause_fix.sql` — **run this first**: closes the data leaks and fixes the Pause button.
   2. `part2_remarks_protection.sql`
   3. `part3_public_page_functions.sql`
   4. `part4_billing_and_integrations.sql`

   They contain exactly the same SQL as `migrations/20260101000100_security_hardening_v1.sql` (a test proves the result is identical),
   split small because the SQL Editor cut one long paste in the middle of a function. Each part is safe to run again, and none
   deletes a table, column or row. Messages such as *"policy … does not exist, skipping"* are normal, not errors. If part 4
   stops with "Duplicate Instantly integrations exist", tell the engineer — it refuses to guess which one to keep.
3. Re-run `verify/fingerprint.sql`. Compare with `verify/latest.fingerprint.txt`: the only differences should be the "accepted drift" rows above.
4. Check the app: pause/resume a client, open a client's public `/c/<slug>` page, post a remark from it.

**Rollback:** it removes only things that should not exist. To undo the Pause fix, re-add the old status constraint; to undo the
revoke, `grant execute on function public.get_campaign_data(uuid, uuid) to authenticated;`.

### Moving to the Supabase CLI later

Do it with a real baseline, not the hand-built one: run `supabase db pull` against production (needs the CLI and Docker) and commit
the result as the new baseline, then apply future migrations with `supabase db push`. The hand-built `…_baseline_v1.sql` is only for
creating throw-away databases for tests.

## Tests

`supabase/tests/run.sh` (`npm run db:test`) needs a local PostgreSQL 14+:

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

1. A brand-new database with every migration applied **twice** (idempotency): `security.test.sql` (tenant isolation,
   anonymous writes, public functions, billing fields, rate limiter) and `v2.test.sql` (workspaces, identity, campaigns,
   stats history, sync runs, portal, V1 retirement).
2. Production's real schema shape (`prod_drift_fixture.sql`) + every migration: the same suites + `prod_drift.test.sql`.
3. Production's shape **with realistic V1 data** (`v1_fixture.sql`) and then the V2 migrations (twice):
   `v2_backfill.test.sql` proves every agency got a workspace and an owner, nothing was lost, duplicates were merged,
   V1 and V2 numbers are identical, remarks kept their campaigns, and the V1 archive is untouched.
4. The SQL-editor pieces (`manual-apply/` + `manual-apply/v2/`) give exactly the same schema as the migrations, and the
   old V1 pieces refuse to run on V2.

`supabase/tests/e2e/run.sh` (`npm run e2e:test`) runs the application's own sync/attach/read code through PostgREST
(the API Supabase exposes) against PostgreSQL with real user JWTs and RLS; only the Instantly API is faked. It needs a
PostgREST binary: `POSTGREST_BIN=/path/to/postgrest supabase/tests/e2e/run.sh`.

`stub_supabase.sql` fakes `auth`/`storage`/roles for the test database only; never run it against a real project.

## Known schema debt

Resolved by V2: `agency_details` as tenant (now `workspaces` + `workspace_members`); `campaigns.client_id` NOT NULL
(V2 campaigns need no client); no history (daily `campaign_stats` snapshots); no unique key per provider campaign
(`UNIQUE(integration_id, external_id)`); demo/Smartlead functions (dropped); `p_user_id` RPCs (no longer callable);
provider-specific columns (V2 tables are provider-neutral, with `provider_raw` JSON).

Still open (deliberately not changed):

- `integrations.tool` is kept next to `provider` (a trigger keeps them equal) so nothing that still reads `tool` breaks.
- `clients.sending_capacity|active_inboxes|domain_health_*` are hand-typed values (until real mailbox data exists).
- The V1 archive tables (`campaigns`, `agency_details`) and the `agency_id` columns remain; dropping them is a separate,
  explicit decision once nobody needs the history.
- `/c/[slug]` is protected only by an unguessable-ish, user-chosen slug (no token).
