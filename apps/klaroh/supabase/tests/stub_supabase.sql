-- Minimal stand-ins for the Supabase-provided objects the Klaroh migrations
-- depend on (roles, auth.users/auth.uid(), storage.buckets). TEST USE ONLY —
-- never run against a real Supabase project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
-- Same lookup order as Supabase's auth.uid(): legacy GUC, then PostgREST's JWT claims.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
     )::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);

grant usage on schema public, auth to anon, authenticated, service_role;
-- Supabase grants new public objects to the API roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
