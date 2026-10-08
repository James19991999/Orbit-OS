-- OrbitOS — run in Supabase → SQL Editor after setup_all.sql. Every row should say ok = true.
select 'tables created' as check_name,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') >= 30 as ok,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')::text as detail
union all
select 'row-level security on every table',
       not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
       coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'all tables protected')
union all
select 'storage buckets',
       (select count(*) from storage.buckets where id in ('avatars', 'evidence', 'vault', 'exports')) = 4,
       (select string_agg(id, ', ' order by id) from storage.buckets)
union all
select 'key functions',
       (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
          and proname in ('create_organization', 'redeem_invite', 'apply_intasend_payment', 'apply_invoice_payment', 'is_org_member', 'has_org_role', 'can_write')) = 7,
       (select string_agg(distinct proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
          and proname in ('create_organization', 'redeem_invite', 'apply_intasend_payment', 'apply_invoice_payment', 'is_org_member', 'has_org_role', 'can_write'))
union all
select 'realtime enabled for live tables',
       (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') >= 4,
       coalesce((select string_agg(tablename, ', ') from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), 'none')
union all
select 'currencies KES/USD/EUR/GBP',
       pg_get_constraintdef((select oid from pg_constraint where conname = 'organizations_currency_check')) like '%GBP%',
       pg_get_constraintdef((select oid from pg_constraint where conname = 'organizations_currency_check'))
union all
select 'no demo data (seed.sql not run)',
       not exists (select 1 from auth.users where email like '%@acme-global.demo'),
       (select count(*) from auth.users where email like '%@acme-global.demo')::text || ' demo users';
