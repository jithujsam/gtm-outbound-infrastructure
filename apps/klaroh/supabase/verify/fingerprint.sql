-- Read-only schema fingerprint of the Klaroh `public` schema.
--
-- Run in the Supabase SQL editor (or psql) against any database and diff the
-- output with supabase/verify/baseline.fingerprint.txt. Every line is
-- order-independent and stable, so identical schemas give identical text.
-- Changes nothing.

with
cols as (
  select 'column ' || c.table_name || '.' || c.column_name || ' ' || c.data_type
         || coalesce('(' || c.character_maximum_length || ')', '')
         || coalesce('(' || c.numeric_precision || ',' || c.numeric_scale || ')', '')
         || ' null=' || c.is_nullable
         || ' default=' || coalesce(regexp_replace(c.column_default, '\s+', ' ', 'g'), '-')
         || ' gen=' || coalesce(c.generation_expression, '-') as line
  from information_schema.columns c
  where c.table_schema = 'public'
),
cons as (
  select 'constraint ' || cl.relname || ' ' || co.contype::text || ' '
         || regexp_replace(pg_get_constraintdef(co.oid), '\s+', ' ', 'g') as line
  from pg_constraint co
  join pg_class cl on cl.oid = co.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public'
),
idx as (
  select 'index ' || tablename || ' ' || regexp_replace(indexdef, '\s+', ' ', 'g') as line
  from pg_indexes
  where schemaname = 'public' and indexname not like '%\_pkey' escape '\'
),
rls as (
  select 'rls ' || relname || ' enabled=' || relrowsecurity as line
  from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and cl.relkind = 'r'
),
pol as (
  select 'policy ' || tablename || ' ' || policyname || ' ' || cmd
         || ' roles=' || array_to_string(roles, ',')
         || ' using=' || coalesce(regexp_replace(qual, '\s+', ' ', 'g'), '-')
         || ' check=' || coalesce(regexp_replace(with_check, '\s+', ' ', 'g'), '-') as line
  from pg_policies where schemaname = 'public'
),
trg as (
  select 'trigger ' || cl.relname || ' ' || t.tgname || ' '
         || regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g') as line
  from pg_trigger t
  join pg_class cl on cl.oid = t.tgrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),
fn as (
  select 'function ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         || ' secdef=' || p.prosecdef
         || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-')
         || ' body=' || md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) as line
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
fnacl as (
  select 'execute ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') '
         || case when a.grantee = 0 then 'PUBLIC' else r.rolname end as line
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public' and a.privilege_type = 'EXECUTE'
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))
)
select line from (
  select line from cols union all select line from cons union all select line from idx
  union all select line from rls union all select line from pol union all select line from trg
  union all select line from fn union all select line from fnacl
) all_lines
order by line;
