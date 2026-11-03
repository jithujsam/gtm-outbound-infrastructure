-- Klaroh — SQL Editor part 15: 20261008000100_outbound_analytics.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261008000100_outbound_analytics.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261008000100_outbound_analytics.sql — analytics + sending infrastructure
--
-- Extends the V2 model (nothing is replaced, nothing is deleted). Same rules
-- as campaigns_v2 / campaign_stats: provider-neutral columns, tenancy derived
-- server-side from the parent row, workspace-member RLS, no user deletes,
-- one row per day for history.
--
--   campaigns_v2.sender_emails   the sending accounts a campaign uses
--   campaign_step_stats          per sequence step (and variant) counters,
--                                one snapshot per campaign/step/variant/day
--   email_accounts               sending mailboxes (email IDs) used by the
--                                campaigns in the sync scope — INFRASTRUCTURE,
--                                never leads. No credentials, ever.
--   email_account_stats          per mailbox per day: campaign sends and the
--                                separate warmup activity (never mixed)
--   email_domains                DNS checks of the sending domains
--   sync_runs.details            what the optional parts of a sync did
--
-- Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── campaigns: sending accounts ─────────────────────────────────────────────
alter table public.campaigns_v2 add column if not exists sender_emails text[];
alter table public.sync_runs add column if not exists details jsonb;

-- ── step analytics ──────────────────────────────────────────────────────────
create table if not exists public.campaign_step_stats (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns_v2(id) on delete cascade,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  sync_run_id    uuid references public.sync_runs(id) on delete set null,
  stat_date      date not null,
  captured_at    timestamptz not null default now(),
  step           integer not null check (step >= 1),
  -- '' = the step as a whole (provider gives no variant split)
  variant        text not null default '',
  -- cumulative (lifetime-to-date); null = not reported by the provider
  sent           bigint,
  opens          bigint,
  opens_unique   bigint,
  replies        bigint,
  replies_unique bigint,
  clicks         bigint,
  clicks_unique  bigint,
  opportunities  bigint,
  constraint campaign_step_stats_key unique (campaign_id, stat_date, step, variant)
);
create index if not exists idx_campaign_step_stats_workspace_id on public.campaign_step_stats (workspace_id);

-- ── sending infrastructure ──────────────────────────────────────────────────
create table if not exists public.email_accounts (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  integration_id         uuid not null references public.integrations(id),
  provider               text not null,
  email                  text not null check (email = lower(email) and position('@' in email) > 1),
  status                 text not null default 'unknown'
                         check (status in ('active', 'paused', 'error', 'unknown')),
  provider_status        text,
  warmup_status          text not null default 'unknown'
                         check (warmup_status in ('active', 'paused', 'error', 'unknown')),
  provider_warmup_status text,
  -- provider health score for the mailbox's warmup, 0–100
  warmup_score           numeric(5,2) check (warmup_score is null or warmup_score between 0 and 100),
  daily_limit            integer,
  sending_gap_minutes    integer,
  tracking_domain        text,
  tracking_domain_status text,
  last_used_at           timestamptz,
  external_created_at    timestamptz,
  -- whitelisted provider fields only; never secrets (see check below)
  provider_raw           jsonb,
  first_synced_at        timestamptz not null default now(),
  last_synced_at         timestamptz,
  unavailable_since      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint email_accounts_integration_email_key unique (integration_id, email),
  constraint email_accounts_no_secrets check (
    provider_raw is null or not (provider_raw ?| array[
      'password', 'smtp_password', 'imap_password', 'smtp_pass', 'imap_pass',
      'access_token', 'refresh_token', 'api_key', 'app_password', 'oauth_token'])
  )
);
create index if not exists idx_email_accounts_workspace_id on public.email_accounts (workspace_id);

create table if not exists public.email_account_stats (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.email_accounts(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  stat_date           date not null,
  captured_at         timestamptz not null default now(),
  -- campaign sending ON this day (not cumulative); null = not reported
  sent                bigint,
  bounced             bigint,
  replies             bigint,
  -- warmup activity ON this day — kept apart from campaign sending
  warmup_sent         bigint,
  warmup_landed_inbox bigint,
  warmup_landed_spam  bigint,
  warmup_received     bigint,
  constraint email_account_stats_day_key unique (account_id, stat_date)
);
create index if not exists idx_email_account_stats_workspace_id on public.email_account_stats (workspace_id);

create table if not exists public.email_domains (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id),
  domain         text not null check (domain = lower(domain) and length(domain) between 3 and 253),
  -- null = not checked / not reported
  spf            boolean,
  dkim           boolean,
  dmarc          boolean,
  mx             boolean,
  checked_at     timestamptz not null default now(),
  constraint email_domains_integration_domain_key unique (integration_id, domain)
);
create index if not exists idx_email_domains_workspace_id on public.email_domains (workspace_id);

-- ── integrity triggers: tenancy is derived, never trusted ───────────────────
create or replace function public.campaign_step_stats_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id from campaigns_v2 where id = new.campaign_id;
  if new.workspace_id is null then
    raise exception 'Unknown campaign' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.captured_at < old.captured_at then
    return old;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_campaign_step_stats_guard on public.campaign_step_stats;
create trigger trg_campaign_step_stats_guard before insert or update on public.campaign_step_stats
  for each row execute function public.campaign_step_stats_guard();

-- integration-owned rows: the integration decides workspace and provider
create or replace function public.integration_owned_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_workspace uuid;
  v_provider  text;
begin
  select workspace_id, provider into v_workspace, v_provider
  from integrations where id = new.integration_id;
  if v_workspace is null then
    raise exception 'Unknown integration' using errcode = '23503';
  end if;
  if new.workspace_id is distinct from v_workspace then
    raise exception 'Integration belongs to another workspace' using errcode = '42501';
  end if;
  if tg_table_name = 'email_accounts' then
    new.provider := v_provider;
    if tg_op = 'UPDATE' then
      new.first_synced_at := old.first_synced_at;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_email_accounts_guard on public.email_accounts;
create trigger trg_email_accounts_guard before insert or update on public.email_accounts
  for each row execute function public.integration_owned_guard();
drop trigger if exists update_email_accounts_updated_at on public.email_accounts;
create trigger update_email_accounts_updated_at before update on public.email_accounts
  for each row execute function public.update_updated_at();
drop trigger if exists trg_email_domains_guard on public.email_domains;
create trigger trg_email_domains_guard before insert or update on public.email_domains
  for each row execute function public.integration_owned_guard();

create or replace function public.email_account_stats_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id from email_accounts where id = new.account_id;
  if new.workspace_id is null then
    raise exception 'Unknown email account' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.captured_at < old.captured_at then
    return old;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_email_account_stats_guard on public.email_account_stats;
create trigger trg_email_account_stats_guard before insert or update on public.email_account_stats
  for each row execute function public.email_account_stats_guard();

revoke all on function public.campaign_step_stats_guard() from public, anon, authenticated;
revoke all on function public.integration_owned_guard() from public, anon, authenticated;
revoke all on function public.email_account_stats_guard() from public, anon, authenticated;

-- ── RLS: workspace members only; history is not deletable by users ──────────
alter table public.campaign_step_stats enable row level security;
alter table public.email_accounts      enable row level security;
alter table public.email_account_stats enable row level security;
alter table public.email_domains       enable row level security;

do $fn$
declare
  t text;
begin
  foreach t in array array['campaign_step_stats', 'email_accounts', 'email_account_stats', 'email_domains'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',
                   t || '_member_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id))',
                   t || '_member_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',
                   t || '_member_update', t);
    -- the public portal never reads infrastructure or step data
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
  end loop;
end;
$fn$;
