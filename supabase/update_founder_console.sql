-- ════════════════════════════════════════════════════════════════════════════
-- OrbitOS — UPDATE that adds the Founder Console data (people online, background job runs, delivery failures).
-- For a project that already ran update_etims_calendar.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.etims_configs') is null then
    raise exception 'Run supabase/update_etims_calendar.sql first, then this file — nothing was changed.';
  end if;
  if to_regclass('public.user_activity') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

-- ──────────────────────────── 20261011000010_founder_console.sql ────────────────────────────
-- Founder Console: what the platform operator needs to run OrbitOS (people online, revenue, health).
-- Everything here is server-only: no client can read these tables or call the aggregate functions.
-- Access to the console itself is limited to FOUNDER_EMAILS with a two-factor session (see src/lib/founder).

-- ───────── Last seen, one row per person (written by the app every ~2 minutes while a tab is open) ─────────
create table public.user_activity (
  user_id uuid primary key references auth.users on delete cascade,
  last_seen_at timestamptz not null default now(),
  org_id uuid references public.organizations on delete set null
);
create index on public.user_activity (last_seen_at desc);
alter table public.user_activity enable row level security;
revoke all on public.user_activity from authenticated, anon;

-- Records "I'm here" for the signed-in person. At most one write a minute per person.
create or replace function public.touch_activity(p_org uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_org is not null and not public.is_org_member(p_org) then p_org := null; end if;
  insert into public.user_activity as a (user_id, last_seen_at, org_id) values (auth.uid(), now(), p_org)
  on conflict (user_id) do update set last_seen_at = now(), org_id = coalesce(excluded.org_id, a.org_id)
    where a.last_seen_at < now() - interval '50 seconds' or a.org_id is distinct from coalesce(excluded.org_id, a.org_id);
end $$;
revoke all on function public.touch_activity(uuid) from public, anon;
grant execute on function public.touch_activity(uuid) to authenticated;

-- ───────── Background jobs: last run of each hourly/daily job ─────────
create table public.job_runs (
  job text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_ok_at timestamptz,
  last_status int,
  last_error text,
  last_summary text,
  last_duration_ms int,
  runs bigint not null default 0,
  failures bigint not null default 0
);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from authenticated, anon;

-- Called by the server after each job (src/lib/api.ts handler). Keeps run and failure counts.
create or replace function public.record_job_run(p_job text, p_status int, p_ms int, p_summary text, p_error text)
returns void language sql security definer set search_path = public as $$
  insert into public.job_runs as j (job, last_started_at, last_finished_at, last_ok_at, last_status, last_error, last_summary, last_duration_ms, runs, failures)
  values (p_job, now() - make_interval(secs => p_ms / 1000.0), now(), case when p_status < 400 then now() end, p_status,
          case when p_status >= 400 then p_error end, left(p_summary, 300), p_ms, 1, case when p_status >= 400 then 1 else 0 end)
  on conflict (job) do update set
    last_started_at = excluded.last_started_at, last_finished_at = excluded.last_finished_at,
    last_ok_at = coalesce(excluded.last_ok_at, j.last_ok_at), last_status = excluded.last_status,
    last_error = excluded.last_error, last_summary = excluded.last_summary, last_duration_ms = excluded.last_duration_ms,
    runs = j.runs + 1, failures = j.failures + excluded.failures;
$$;
revoke all on function public.record_job_run(text, int, int, text, text) from public, anon, authenticated;
grant execute on function public.record_job_run(text, int, int, text, text) to service_role;

-- ───────── Emails and WhatsApp messages that could not be delivered (kept 90 days) ─────────
create table public.delivery_failures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('email', 'whatsapp')),
  error text not null,
  context text
);
create index on public.delivery_failures (created_at desc);
alter table public.delivery_failures enable row level security;
revoke all on public.delivery_failures from authenticated, anon;

-- ───────── Who opened the Founder Console (it shows every workspace) ─────────
create table public.platform_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users on delete set null,
  actor_email text,
  action text not null,
  metadata jsonb not null default '{}',
  ip text
);
create index on public.platform_audit (created_at desc);
alter table public.platform_audit enable row level security;
revoke all on public.platform_audit from authenticated, anon;

-- ───────── Aggregates for the console (one round trip; service role only) ─────────
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
    'calendar_connections', (select count(*) from public.calendar_connections where status = 'active')
  );
$$;

-- Workspace list with members, last activity and lifetime revenue. Optional search on name or address.
create or replace function public.platform_workspaces(p_search text default null)
returns table (id uuid, name text, slug text, plan text, plan_period text, status text, plan_expires_at timestamptz,
               created_at timestamptz, seat_limit int, members bigint, last_active timestamptz, revenue jsonb, currency text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.slug, o.plan, o.plan_period, o.status, o.plan_expires_at, o.created_at, o.seat_limit,
         (select count(*) from public.memberships m where m.org_id = o.id and m.status = 'active'),
         (select max(a.last_seen_at) from public.user_activity a join public.memberships m on m.user_id = a.user_id and m.org_id = o.id and m.status = 'active'),
         (select coalesce(jsonb_object_agg(r.currency, r.total), '{}') from (
             select p.currency, sum(p.amount_minor)::bigint as total from public.billing_payments p
              where p.org_id = o.id and p.state = 'COMPLETE' group by p.currency) r),
         o.currency
    from public.organizations o
   where p_search is null or p_search = '' or o.name ilike '%' || p_search || '%' or o.slug ilike '%' || p_search || '%'
   order by o.created_at desc
   limit 200;
$$;

revoke all on function public.platform_metrics(), public.platform_workspaces(text) from public, anon, authenticated;
grant execute on function public.platform_metrics(), public.platform_workspaces(text) to service_role;

-- ──────────────────────────── record as applied (Supabase CLI bookkeeping) ────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261011000010', 'founder_console')
on conflict (version) do nothing;

commit;

-- Done. Check it worked with supabase/verify_setup.sql
