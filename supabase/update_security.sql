-- ════════════════════════════════════════════════════════════════════════════
-- OrbitOS — SECURITY UPDATE (October 12, 2026): file size and type limits on uploads, two-factor required to add or
-- delete vault documents, and failed sign-in counts in the Founder Console.
-- For a project that already ran update_founder_console.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run. One transaction: if anything fails, nothing changes. Safe to run again.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.user_activity') is null then
    raise exception 'Run supabase/update_founder_console.sql first, then this file — nothing was changed.';
  end if;
end $guard$;

-- ──────────────────────────── 20261012000011_security_hardening.sql ────────────────────────────
-- Security hardening (October 12, 2026).
-- 1. Uploaded files: size and type limits enforced by Supabase Storage itself, so they hold even when someone
--    bypasses the app and calls the storage API directly (the app's own checks only run in the browser).
-- 2. The document vault: adding or deleting documents now needs a two-factor session, like reading already did.
--    A stolen password alone can no longer remove a company's documents.
-- 3. Founder Console: failed sign-in counts, so attacks on accounts are visible.

update storage.buckets set file_size_limit = 2097152,                   -- 2 MB profile photos
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 where id = 'avatars';
update storage.buckets set file_size_limit = 20971520,                  -- 20 MB documents
       allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain', 'text/csv',
         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/zip']
 where id in ('evidence', 'vault');

drop policy if exists "vault write managers" on storage.objects;
drop policy if exists "vault delete managers" on storage.objects;
create policy "vault write managers" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "vault delete managers" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));

-- The vault's document list follows the same rule (owners and directors, two-factor session) for changes.
drop policy if exists vault_insert on public.vault_documents;
drop policy if exists vault_delete on public.vault_documents;
create policy vault_insert on public.vault_documents for insert to authenticated
  with check (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' and public.can_write(org_id, array['owner','director']));
create policy vault_delete on public.vault_documents for delete to authenticated
  using (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' and public.can_write(org_id, array['owner','director']));

-- Platform-wide security counts read by action and time.
create index if not exists audit_log_action_created_idx on public.audit_log (action, created_at desc);

create or replace function public.platform_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  with
  firsts as (select user_id, min(created_at) as joined from public.memberships group by user_id),
  latest_paid as (
    select distinct on (p.org_id) p.org_id, p.currency, p.amount_minor, p.period
      from public.billing_payments p join public.organizations o on o.id = p.org_id
     where p.state = 'COMPLETE' and o.plan_period <> 'trial' and o.plan_expires_at > now() and o.status = 'active'
     order by p.org_id, p.created_at desc)
  select jsonb_build_object(
    'generated_at', now(),
    'workspaces', (select count(*) from public.organizations),
    'paying', (select count(*) from public.organizations where plan_period <> 'trial' and plan_expires_at > now() and status = 'active'),
    'on_trial', (select count(*) from public.organizations where plan_period = 'trial' and plan_expires_at > now() and status = 'active'),
    'lapsed', (select count(*) from public.organizations where plan_expires_at <= now() and status = 'active'),
    'offboarding', (select count(*) from public.organizations where status <> 'active'),
    'new_workspaces_7d', (select count(*) from public.organizations where created_at > now() - interval '7 days'),
    'new_workspaces_30d', (select count(*) from public.organizations where created_at > now() - interval '30 days'),
    'users', (select count(distinct user_id) from public.memberships where status = 'active'),
    'new_users_7d', (select count(*) from firsts where joined > now() - interval '7 days'),
    'new_users_30d', (select count(*) from firsts where joined > now() - interval '30 days'),
    'online_now', (select count(*) from public.user_activity where last_seen_at > now() - interval '5 minutes'),
    'active_24h', (select count(*) from public.user_activity where last_seen_at > now() - interval '24 hours'),
    'active_7d', (select count(*) from public.user_activity where last_seen_at > now() - interval '7 days'),
    'active_30d', (select count(*) from public.user_activity where last_seen_at > now() - interval '30 days'),
    'signins_today', (select count(distinct actor_id) from public.audit_log where action = 'auth.login' and created_at > date_trunc('day', now())),
    'online', (select coalesce(jsonb_agg(x order by x.last_seen_at desc), '[]') from (
        select a.last_seen_at, p.full_name as name, o.name as workspace
          from public.user_activity a left join public.profiles p on p.id = a.user_id left join public.organizations o on o.id = a.org_id
         where a.last_seen_at > now() - interval '5 minutes' order by a.last_seen_at desc limit 50) x),
    'plan_mix', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (
        select plan, plan_period as period, count(*) as n from public.organizations
         where plan_expires_at > now() and status = 'active' group by plan, plan_period) x),
    'mrr', (select coalesce(jsonb_agg(x order by x.currency), '[]') from (
        select currency, round(sum(case when period = 'annual' then amount_minor / 12.0 else amount_minor end))::bigint as amount_minor, count(*) as workspaces
          from latest_paid group by currency) x),
    'revenue_by_month', (select coalesce(jsonb_agg(x order by x.month, x.currency), '[]') from (
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, currency, sum(amount_minor)::bigint as amount_minor, count(*) as payments
          from public.billing_payments
         where state = 'COMPLETE' and created_at >= date_trunc('month', now()) - interval '11 months'
         group by 1, 2) x),
    'failed_payments_7d', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select p.created_at, o.name as workspace, p.method, p.currency, p.amount_minor
          from public.billing_payments p join public.organizations o on o.id = p.org_id
         where p.state = 'FAILED' and p.created_at > now() - interval '7 days' order by p.created_at desc limit 20) x),
    'trials_ending', (select coalesce(jsonb_agg(x order by x.plan_expires_at), '[]') from (
        select name, slug, plan_expires_at from public.organizations
         where plan_period = 'trial' and status = 'active' and plan_expires_at between now() and now() + interval '7 days' limit 30) x),
    'renewals_due', (select coalesce(jsonb_agg(x order by x.plan_expires_at), '[]') from (
        select name, slug, plan, plan_period, plan_expires_at from public.organizations
         where plan_period <> 'trial' and status = 'active' and plan_expires_at between now() - interval '3 days' and now() + interval '7 days' limit 30) x),
    'etims', jsonb_build_object(
        'queued', (select count(*) from public.etims_documents where status = 'queued'),
        'rejected_7d', (select count(*) from public.etims_documents where status = 'rejected' and created_at > now() - interval '7 days'),
        'submitted_24h', (select count(*) from public.etims_documents where status = 'submitted' and submitted_at > now() - interval '24 hours'),
        'oldest_queued', (select min(created_at) from public.etims_documents where status = 'queued'),
        'connected_workspaces', (select count(*) from public.etims_configs where scope <> 'platform' and status = 'active'),
        'platform_status', (select status from public.etims_configs where scope = 'platform')),
    'delivery_failures_24h', (select coalesce(jsonb_object_agg(channel, n), '{}') from (
        select channel, count(*) as n from public.delivery_failures where created_at > now() - interval '24 hours' group by channel) x),
    'recent_delivery_failures', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select created_at, channel, error, context from public.delivery_failures order by created_at desc limit 10) x),
    'jobs', (select coalesce(jsonb_agg(j order by j.job), '[]') from public.job_runs j),
    'calendar_connections', (select count(*) from public.calendar_connections where status = 'active'),
    'security', jsonb_build_object(
        'failed_logins_1h', (select count(*) from public.audit_log where action = 'auth.login_failed' and created_at > now() - interval '1 hour'),
        'failed_logins_24h', (select count(*) from public.audit_log where action = 'auth.login_failed' and created_at > now() - interval '24 hours'),
        'accounts_targeted_24h', (select count(distinct target_id) from public.audit_log where action = 'auth.login_failed' and created_at > now() - interval '24 hours'),
        'mfa_users', (select count(distinct user_id) from auth.mfa_factors where status = 'verified'))
  );
$$;

-- ──────────────────────────── record as applied (Supabase CLI bookkeeping) ────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261012000011', 'security_hardening')
on conflict (version) do nothing;

commit;

-- Done. Check it worked with supabase/verify_setup.sql
