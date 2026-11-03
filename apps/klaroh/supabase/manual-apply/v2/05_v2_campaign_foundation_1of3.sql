-- Klaroh V2 — SQL Editor part 05: 20261006000300_v2_campaign_foundation.sql, piece 1 of 3.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000300_v2_campaign_foundation.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000300_v2_campaign_foundation.sql — V2 PHASE 3: campaign foundation
--
-- Provider-neutral campaign storage. Nothing here knows about Instantly:
--
--   campaigns_v2         one row per provider campaign, UNIQUE(integration_id, external_id);
--                        does NOT require a client
--   campaign_stats       historical snapshots: one row per campaign per day
--                        (UNIQUE(campaign_id, stat_date)); earlier days are never
--                        overwritten, repeated syncs on the same day refresh that
--                        day's snapshot; provider_raw keeps the provider payload
--   campaign_client_map  optional campaign ↔ client relationship
--   sync_runs            one row per sync: status, counts, error
--   campaign_legacy_map  which V1 `campaigns` row became which V2 campaign
--
-- Tenancy (workspace_id) is always derived server-side from the parent row.
-- Non-destructive and idempotent. The application is not switched here.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.campaigns_v2 (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  integration_id      uuid not null references public.integrations(id),
  provider            text not null,
  external_id         text not null,
  name                text not null,
  display_name        text,
  status              text not null default 'unknown'
                      check (status in ('draft', 'active', 'paused', 'completed', 'error', 'suspended', 'unknown')),
  provider_status     text,
  is_evergreen        boolean,
  sender_count        integer,
  daily_limit         integer,
  start_date          date,
  end_date            date,
  external_created_at timestamptz,
  external_updated_at timestamptz,
  provider_raw        jsonb,
  first_synced_at     timestamptz not null default now(),
  last_synced_at      timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint campaigns_v2_integration_external_key unique (integration_id, external_id)
);
create index if not exists idx_campaigns_v2_workspace_id on public.campaigns_v2 (workspace_id);

create table if not exists public.sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  integration_id     uuid references public.integrations(id) on delete set null,
  provider           text not null,
  triggered_by       text not null check (triggered_by in ('manual', 'cron', 'attach', 'backfill')),
  status             text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  campaigns_seen     integer not null default 0,
  campaigns_upserted integer not null default 0,
  stats_written      integer not null default 0,
  error_message      text
);
create index if not exists idx_sync_runs_integration_started on public.sync_runs (integration_id, started_at desc);
create index if not exists idx_sync_runs_workspace_started on public.sync_runs (workspace_id, started_at desc);

create table if not exists public.campaign_stats (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns_v2(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  sync_run_id         uuid references public.sync_runs(id) on delete set null,
  stat_date           date not null,
  captured_at         timestamptz not null default now(),
  -- cumulative (lifetime-to-date) counters; null = not reported by the provider
  leads               bigint,
  contacted           bigint,
  new_leads_contacted bigint,
  emails_sent         bigint,
  opens               bigint,
  opens_unique        bigint,
  replies             bigint,
  replies_unique      bigint,
  clicks              bigint,
  clicks_unique       bigint,
  bounces             bigint,
  unsubscribes        bigint,
  completed           bigint,
  opportunities       bigint,
  opportunity_value   numeric(14,2),
  interested          bigint,
  meetings_booked     bigint,
  meetings_completed  bigint,
  closed              bigint,
  provider_raw        jsonb,
  constraint campaign_stats_campaign_day_key unique (campaign_id, stat_date)
);
create index if not exists idx_campaign_stats_workspace_id on public.campaign_stats (workspace_id);

create table if not exists public.campaign_client_map (
  campaign_id  uuid not null references public.campaigns_v2(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (campaign_id, client_id)
);
create index if not exists idx_campaign_client_map_client_id on public.campaign_client_map (client_id);
create index if not exists idx_campaign_client_map_workspace_id on public.campaign_client_map (workspace_id);

create table if not exists public.campaign_legacy_map (
  legacy_campaign_id uuid primary key,
  campaign_id        uuid not null references public.campaigns_v2(id) on delete cascade,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  legacy_client_id   uuid,
  migrated_at        timestamptz not null default now()
);
create index if not exists idx_campaign_legacy_map_campaign_id on public.campaign_legacy_map (campaign_id);
