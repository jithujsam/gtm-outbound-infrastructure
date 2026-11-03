-- Klaroh security fix, part 4 of 4: plan cannot be self-edited; one Instantly per agency
-- Same SQL as supabase/migrations/20260101000100_security_hardening_v1.sql, split into
-- smaller pieces for the Supabase SQL Editor. Safe to run more than once. Deletes no data.
-- Users can no longer change their own plan/trial date; prevents duplicate Instantly connections.

-- ── 6. agency_details: plan and created_at are not user-editable ─────────────
-- `current_user` is the invoking role: 'authenticated'/'anon' for requests made
-- with a user/anon JWT; service_role and the dashboard/postgres bypass this.
create or replace function public.protect_agency_billing_fields()
returns trigger
language plpgsql as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := 'trial';
      new.created_at := now();
    else
      new.plan := old.plan;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists protect_agency_billing_fields on public.agency_details;
create trigger protect_agency_billing_fields
  before insert or update on public.agency_details
  for each row execute function public.protect_agency_billing_fields();

-- ── 7. at most one Instantly integration per agency ─────────────────────────
do $fn$
begin
  if exists (
    select 1 from public.integrations
    where tool = 'instantly'
    group by agency_id
    having count(*) > 1
  ) then
    raise exception
      'Duplicate Instantly integrations exist for an agency. Resolve manually (see supabase/README.md) before applying this migration.';
  end if;
end;
$fn$;

create unique index if not exists uq_integrations_agency_instantly
  on public.integrations (agency_id)
  where tool = 'instantly';
