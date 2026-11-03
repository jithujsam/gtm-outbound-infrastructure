-- Klaroh security fix, part 2 of 4: remarks cannot be written into someone else's client
-- Same SQL as supabase/migrations/20260101000100_security_hardening_v1.sql, split into
-- smaller pieces for the Supabase SQL Editor. Safe to run more than once. Deletes no data.
-- Fixes fake/cross-client remarks and makes public remark posting work.

-- ── 1 + 2. remarks: derive tenancy, validate campaign + attachment ───────────
-- Refuses to run once Klaroh V2 is installed: this V1 file would undo V2 changes.
do $guard$ begin
  if to_regclass('public.campaigns_v2') is not null then
    raise exception 'Klaroh V2 is installed: do not run this V1 file again (it would undo V2 changes). Nothing was changed.';
  end if;
end $guard$;

create or replace function public.set_remark_agency_id()
returns trigger
security definer set search_path = public
language plpgsql as $fn$
declare
  v_agency_id uuid;
begin
  select agency_id into v_agency_id from clients where id = new.client_id;
  if v_agency_id is null then
    raise exception 'Unknown client' using errcode = '23503';
  end if;

  -- Never trust a caller-supplied agency_id.
  new.agency_id := v_agency_id;

  if new.campaign_id is not null and not exists (
    select 1 from campaigns where id = new.campaign_id and client_id = new.client_id
  ) then
    raise exception 'Campaign does not belong to client' using errcode = '23514';
  end if;

  if new.attachment_url is not null and new.attachment_url !~
     '^https://[^/]+/storage/v1/object/public/remark-attachments/[0-9a-f-]{36}\.(pdf|png|jpg|docx)$' then
    raise exception 'Invalid attachment url' using errcode = '23514';
  end if;

  if new.attachment_name is not null and char_length(new.attachment_name) > 255 then
    raise exception 'Attachment name too long' using errcode = '23514';
  end if;

  return new;
end;
$fn$;

-- ── 3. anonymous (client portal) remarks: RPC only ──────────────────────────
drop policy if exists "public_insert_client_remarks" on public.remarks;
revoke insert on public.remarks from anon;

create or replace function public.post_public_remark(
  p_client_id       uuid,
  p_campaign_id     uuid,
  p_category        text,
  p_title           text,
  p_body            text,
  p_attachment_url  text default null,
  p_attachment_name text default null
)
returns public.remarks
security definer set search_path = public
language plpgsql as $fn$
declare
  v_row public.remarks;
begin
  -- Same error for "unknown" and "not active" so ids cannot be probed.
  if not exists (select 1 from clients c where c.id = p_client_id and c.status = 'active') then
    raise exception 'Client not available' using errcode = '42501';
  end if;

  if p_category is null or p_category not in (
    'Weekly Review', 'Campaign Update', 'Lead Report', 'Strategy Change',
    'Issue Flagged', 'Client Request', 'General'
  ) then
    raise exception 'Invalid category' using errcode = '22023';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 or char_length(p_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;

  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(p_body) > 10000 then
    raise exception 'Invalid body' using errcode = '22023';
  end if;

  -- agency_id is derived and campaign/attachment validated by the trigger.
  insert into remarks (client_id, campaign_id, author_type, category, title, body,
                       attachment_url, attachment_name)
  values (p_client_id, p_campaign_id, 'client', p_category, btrim(p_title), btrim(p_body),
          p_attachment_url, p_attachment_name)
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke all on function public.post_public_remark(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.post_public_remark(uuid, uuid, text, text, text, text, text)
  to anon, authenticated;
