-- Klaroh — SQL Editor part 13: 20261007000100_client_onboarding_integrations.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261007000100_client_onboarding_integrations.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261007000100_client_onboarding_integrations.sql — client onboarding + ESPs
--
-- Builds on the V2 model; no new tables. The relationship the onboarding flow
-- needs already exists:
--
--   workspace → integrations → campaigns_v2 (provider campaign)
--             → campaign_client_map (which campaigns a client uses)
--
-- campaign_client_map is the sync scope: from now on the application only
-- stores and syncs provider campaigns that are linked to a client. This file:
--
--   1. Credentials never leave the server: signed-in users can no longer read
--      integrations.api_key_encrypted (nor write integrations directly). The
--      server reads/writes credentials with the service role after resolving
--      the caller's workspace from their session.
--   2. integrations.has_credential: a non-secret "a key is stored" flag the
--      browser may read.
--   3. campaigns_v2.unavailable_since: set by sync when a selected campaign is
--      no longer returned by the provider (deleted/archived there). The
--      campaign and its history stay visible; it is simply no longer updated.
--
-- get_client_campaigns() is deliberately left unchanged (re-running an earlier
-- part must keep working); the app reads unavailable_since from campaigns_v2.
-- Additive and idempotent. Nothing is deleted.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── 1 + 2. integrations: hide the credential from the API ───────────────────
alter table public.integrations
  add column if not exists has_credential boolean
  generated always as (api_key_encrypted is not null) stored;

-- Table-level privileges would override a column-level revoke, so the table
-- grants are replaced by column grants that leave out api_key_encrypted.
revoke all on public.integrations from anon, authenticated;
grant select (id, workspace_id, provider, tool, label, enabled, has_credential, created_at, updated_at)
  on public.integrations to authenticated;
-- The existing workspace-member RLS policy still scopes those reads.

-- ── 3. campaigns_v2: a selected campaign the provider no longer returns ─────
alter table public.campaigns_v2 add column if not exists unavailable_since timestamptz;
