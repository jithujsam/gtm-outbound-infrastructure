-- Klaroh V2 — SQL Editor part 08: 20261006000400_v2_instantly_backfill.sql, piece 1 of 3.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000400_v2_instantly_backfill.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000400_v2_instantly_backfill.sql — V2 PHASE 4: V1 Instantly → V2
--
-- Moves every existing V1 Instantly campaign into the V2 tables:
--   * one campaigns_v2 row per (integration, Instantly campaign). V1 kept one
--     row per CLIENT, so the same Instantly campaign attached to two clients
--     becomes ONE V2 campaign mapped to both clients. The oldest V1 row's id
--     is reused as the V2 id;
--   * campaign_client_map keeps every client relationship;
--   * campaign_legacy_map records which V1 row became which V2 campaign (and
--     the name the agency gave it on that client);
--   * one campaign_stats snapshot from the V1 metrics, dated at the V1 sync;
--   * one 'backfill' sync_runs row per integration.
-- Remarks that pointed at a V1 campaign now point at its V2 campaign; the
-- original id is kept in remarks.legacy_campaign_id. Remarks on campaigns that
-- are not migrated (demo/legacy rows — fake data) keep their text and client
-- and move to the client's General timeline, with the original id kept.
--
-- The V1 `campaigns` table is NOT modified: it stays as the archive.
-- During the deploy window, V1 writes are mirrored into V2 by a trigger
-- (removed again by the phase 6 migration).
-- Idempotent: re-running converges to the same result.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

alter table public.campaign_legacy_map add column if not exists legacy_name text;
alter table public.remarks add column if not exists legacy_campaign_id uuid;
