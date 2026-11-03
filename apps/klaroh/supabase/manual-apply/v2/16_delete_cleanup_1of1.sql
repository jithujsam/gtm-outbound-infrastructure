-- Klaroh — SQL Editor part 16: 20261008000200_delete_cleanup.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261008000200_delete_cleanup.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261008000200_delete_cleanup.sql — deleting really deletes
--
-- A campaign exists in Klaroh only because a client uses it
-- (campaign_client_map is the sync scope). Until now, removing a campaign from
-- its last client, or deleting that client, left the campaign row and all its
-- statistics behind in the database. From now on:
--
--   * when a campaign loses its LAST client link (campaign removed from the
--     client, or the client deleted), the campaign is deleted together with
--     its daily statistics and step statistics (ON DELETE CASCADE). A campaign
--     still used by another client is kept for that client;
--   * remarks that pointed at it are kept and move to the client's General
--     timeline (remarks.campaign_id ON DELETE SET NULL, unchanged);
--   * sending mailboxes that no remaining campaign of the integration sends
--     from are deleted with their daily statistics, and DNS checks of domains
--     no remaining mailbox uses are deleted.
--
-- Runs as a trigger, so it holds however the delete happens (app, API, SQL).
-- Also removes campaigns that are already linked to no client. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- Infrastructure of an integration that no remaining campaign uses.
create or replace function public.prune_unused_infrastructure(p_integration_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  delete from email_accounts a
   where a.integration_id = p_integration_id
     and not exists (
       select 1 from campaigns_v2 c
        where c.integration_id = a.integration_id and a.email = any(coalesce(c.sender_emails, '{}')));
  delete from email_domains d
   where d.integration_id = p_integration_id
     and not exists (
       select 1 from email_accounts a
        where a.integration_id = d.integration_id and split_part(a.email, '@', 2) = d.domain);
end;
$fn$;

create or replace function public.delete_unlinked_campaign()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_integration uuid;
begin
  if exists (select 1 from campaign_client_map where campaign_id = old.campaign_id) then
    return null; -- still used by another client
  end if;
  delete from campaigns_v2 where id = old.campaign_id returning integration_id into v_integration;
  if v_integration is not null then
    perform prune_unused_infrastructure(v_integration);
  end if;
  return null;
end;
$fn$;

revoke all on function public.prune_unused_infrastructure(uuid) from public, anon, authenticated;
revoke all on function public.delete_unlinked_campaign() from public, anon, authenticated;

drop trigger if exists trg_delete_unlinked_campaign on public.campaign_client_map;
create trigger trg_delete_unlinked_campaign after delete on public.campaign_client_map
  for each row execute function public.delete_unlinked_campaign();

-- ── existing leftovers: campaigns no client uses ────────────────────────────
do $fn$
declare
  r record;
begin
  for r in
    delete from public.campaigns_v2 c
     where not exists (select 1 from public.campaign_client_map m where m.campaign_id = c.id)
    returning c.integration_id
  loop
    perform public.prune_unused_infrastructure(r.integration_id);
  end loop;
end;
$fn$;
