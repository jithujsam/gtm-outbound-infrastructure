-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000600_v2_retire_v1.sql — V2 PHASE 6: retire V1
--
-- APPLY AFTER the V2 application is deployed (see supabase/README.md).
--
-- V2 is the application; V1 stays only as a read-only archive:
--   * the V1 `campaigns` table and `agency_details` keep every row, but signed-in
--     users can only READ them (no insert/update/delete); the service role and
--     the SQL editor can still change them if ever needed;
--   * the transition mirror (V1 writes → V2) is removed;
--   * the V1 read functions are no longer callable from the API (revoked, not
--     dropped — reversible with GRANT);
--   * the dead demo functions are dropped (they hold no data; one of them could
--     delete campaigns).
-- Nothing is deleted from any table. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── transition mirror off ───────────────────────────────────────────────────
drop trigger if exists trg_v2_mirror_legacy_campaign on public.campaigns;
drop function if exists public.v2_mirror_legacy_campaign();

-- ── V1 campaigns: read-only archive ─────────────────────────────────────────
drop policy if exists workspace_member_all_campaigns on public.campaigns;
drop policy if exists workspace_member_read_campaigns on public.campaigns;
create policy workspace_member_read_campaigns on public.campaigns
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.campaigns from anon, authenticated;

-- ── agency_details: read-only archive (the workspace is the profile now) ────
drop policy if exists owner_all_agency_details on public.agency_details;
drop policy if exists owner_read_agency_details on public.agency_details;
create policy owner_read_agency_details on public.agency_details
  for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on public.agency_details from anon, authenticated;

-- Nothing writes agency_details any more, so its V1 → workspace sync is retired.
drop trigger if exists trg_sync_workspace_from_agency on public.agency_details;
drop function if exists public.sync_workspace_from_agency();

-- ── V1 read functions: no longer part of the API ────────────────────────────
do $fn$
declare
  f text;
begin
  foreach f in array array[
    'public.get_public_campaign_data(uuid)',
    'public.get_clients_with_campaign_count(uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end;
$fn$;

-- ── dead demo plumbing ──────────────────────────────────────────────────────
drop function if exists public.generate_demo_data();
drop function if exists public.delete_demo_campaigns(uuid);
drop function if exists public.get_campaign_data(uuid, uuid);
