-- ════════════════════════════════════════════════════════════════════════════
-- OrbitOS — complete database setup for a NEW, EMPTY Supabase project.
-- Paste this whole file into Supabase → SQL Editor → New query, and click Run once.
--
-- • It is the 7 files in supabase/migrations/ joined in order, inside one transaction:
--   if anything fails, nothing is applied and you can fix it and run it again.
-- • It records the migrations as applied, so `supabase db push` later won't re-run them.
-- • Already ran an older setup_all.sql? Run supabase/update_differentiators.sql instead.
-- • Do NOT run supabase/seed.sql on a real project (demo users with a public password).
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs — edit those files, not this one.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if to_regclass('public.organizations') is not null then
    raise exception 'OrbitOS tables already exist in this project. This setup file is only for an empty project — nothing was changed. To upgrade an existing project, run supabase/update_differentiators.sql.';
  end if;
end $guard$;

-- ──────────────────────────── 20261008000001_schema.sql ────────────────────────────
-- OrbitOS schema. All money is stored in minor units (cents) as bigint.
-- Every tenant-owned table carries org_id and is protected by RLS (see 0002).

create extension if not exists pgcrypto;

-- ───────────────────────── Tenancy ─────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  legal_name text,
  currency text not null default 'KES' check (currency in ('KES', 'USD')),
  owner_id uuid not null references auth.users on delete restrict,
  -- billing (server-only columns; see column grants in 0002)
  plan text not null default 'pro' check (plan in ('starter', 'pro', 'enterprise')),
  plan_period text not null default 'trial' check (plan_period in ('trial', 'monthly', 'annual')),
  seat_limit int not null default 50 check (seat_limit > 0),
  plan_expires_at timestamptz not null default (now() + interval '14 days'),
  status text not null default 'active' check (status in ('active', 'suspended', 'offboarding')),
  deletion_scheduled_at timestamptz,
  -- auth & identity (owner-only, written through API routes)
  sso_domain text,
  enforce_mfa_admins boolean not null default false,
  session_timeout_hours int not null default 8 check (session_timeout_hours in (1, 4, 8, 12, 24)),
  -- timezone engine (owner/director editable)
  core_window_start time not null default '08:00',
  core_window_end time not null default '18:00',
  golden_overlap_min_hours numeric(3,1) not null default 2.0 check (golden_overlap_min_hours between 0.5 and 8),
  quiet_hours boolean not null default true,
  auto_detect_timezone boolean not null default true,
  -- operations
  expense_approval_threshold_minor bigint not null default 10000000, -- 100,000.00
  hourly_cost_minor bigint not null default 500000,                   -- 5,000.00 per person-hour
  seat_autoscale boolean not null default false,
  audit_retention_years int not null default 7 check (audit_retention_years between 1 and 10)
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  email text,
  full_name text not null default '',
  avatar_url text,
  timezone text not null default 'Africa/Nairobi',
  work_start time not null default '09:00',
  work_end time not null default '17:00',
  city text,
  country_code text,
  theme text not null default 'system' check (theme in ('system', 'dark', 'light')),
  email_notifications boolean not null default true,
  checkin_reminders boolean not null default true
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'director', 'contributor', 'auditor')),
  title text,
  department text,
  status text not null default 'active' check (status in ('active', 'removed')),
  unique (org_id, user_id)
);
create index on public.memberships (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  email text not null,
  role text not null check (role in ('director', 'contributor', 'auditor')),
  code text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  invited_by uuid references auth.users on delete set null
);
create index on public.invites (org_id);

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  jurisdiction text not null,
  entity_type text,
  hub_label text,
  is_primary boolean not null default false
);
create index on public.legal_entities (org_id);

-- ───────────────────────── Operations ─────────────────────────
create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  goal text,
  starts_on date not null,
  ends_on date not null,
  committed_points int not null default 0,
  check (ends_on >= starts_on)
);
create index on public.sprints (org_id, starts_on desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  sprint_id uuid references public.sprints on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  assignee_id uuid references auth.users on delete set null,
  created_by uuid references auth.users on delete set null default auth.uid(),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'in_review', 'blocked', 'done')),
  points int not null default 1 check (points between 0 and 100),
  due_on date,
  tags text[] not null default '{}',
  blocked_reason text,
  external_ref text,
  completed_at timestamptz
);
create index on public.tasks (org_id, status);
create index on public.tasks (sprint_id);

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('cash_balance', 'expense', 'revenue', 'payroll')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency in ('KES', 'USD')),
  category text,
  vendor text,
  occurred_on date not null default current_date,
  note text,
  approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users on delete set null,
  created_by uuid references auth.users on delete set null default auth.uid()
);
create index on public.finance_entries (org_id, occurred_on desc);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  number text not null,
  client_name text not null,
  client_email text not null,
  description text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('KES', 'USD')),
  terms_days int not null default 30,
  issued_on date not null default current_date,
  due_on date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  payment_url text,
  paid_at timestamptz,
  created_by uuid references auth.users on delete set null default auth.uid(),
  unique (org_id, number)
);
create index on public.invoices (org_id, status);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  period text not null,               -- e.g. 2026-09
  country_count int not null default 1,
  total_minor bigint not null check (total_minor >= 0),
  currency text not null check (currency in ('KES', 'USD')),
  provider_label text not null default 'Manual',
  status text not null default 'recorded' check (status in ('recorded', 'settled')),
  paid_on date
);
create index on public.payroll_runs (org_id, period desc);

-- ───────────────────────── Scheduling ─────────────────────────
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  duration_min int not null default 30 check (duration_min between 5 and 480),
  organizer_id uuid not null references auth.users on delete cascade default auth.uid(),
  mode text not null default 'sync' check (mode in ('sync', 'async_first')),
  loom_url text,
  video_url text
);
create index on public.meetings (org_id, starts_at);

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  rsvp text not null default 'pending' check (rsvp in ('pending', 'yes', 'no', 'maybe')),
  primary key (meeting_id, user_id)
);
create index on public.meeting_participants (org_id, user_id);

-- ───────────────────────── Culture ─────────────────────────
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  for_date date not null default current_date,
  shipped text not null check (char_length(shipped) between 1 and 2000),
  blockers text,
  mood int not null check (mood between 1 and 5),
  unique (org_id, user_id, for_date)
);
create index on public.check_ins (org_id, for_date desc);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  topic text,
  is_announcement boolean not null default false,
  unique (org_id, slug)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  author_id uuid not null references auth.users on delete cascade default auth.uid(),
  parent_id uuid references public.messages on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  pinned boolean not null default false,
  edited_at timestamptz
);
create index on public.messages (channel_id, created_at desc);
create index on public.messages (org_id, created_at desc);

create table public.message_reactions (
  message_id uuid not null references public.messages on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  emoji text not null check (char_length(emoji) <= 16),
  primary key (message_id, user_id, emoji)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  question text not null,
  anonymous boolean not null default true,
  closes_at timestamptz,
  kind text not null default 'pulse' check (kind in ('pulse', 'announcement', 'enps')),
  created_by uuid references auth.users on delete set null default auth.uid()
);
create index on public.polls (org_id, created_at desc);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  label text not null,
  position int not null default 0
);

create table public.poll_votes (
  poll_id uuid not null references public.polls on delete cascade,
  option_id uuid not null references public.poll_options on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table public.kudos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  from_id uuid not null references auth.users on delete cascade default auth.uid(),
  to_id uuid not null references auth.users on delete cascade,
  badge text not null check (badge in ('firefighter', 'team_glue', 'ship_it', 'innovator')),
  message text not null check (char_length(message) between 1 and 1000),
  check (from_id <> to_id)
);
create index on public.kudos (org_id, created_at desc);

create table public.kudos_reactions (
  kudos_id uuid not null references public.kudos on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  emoji text not null check (emoji in ('👏', '❤️', '🙌', '🌟', '🚀')),
  primary key (kudos_id, user_id, emoji)
);

create table public.lounges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  description text,
  kind text not null check (kind in ('hangout', 'focus')),
  focus_minutes int not null default 25,
  break_minutes int not null default 5,
  rounds int not null default 4,
  session_started_at timestamptz,
  room_code text not null default encode(gen_random_bytes(6), 'hex')
);

-- ───────────────────────── Compliance ─────────────────────────
create table public.compliance_frameworks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  key text not null check (key in ('soc2', 'gdpr', 'iso27001', 'hipaa', 'custom')),
  name text not null,
  description text,
  target_date date,
  policy_version text,
  unique (org_id, key)
);

create table public.compliance_controls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  framework_id uuid not null references public.compliance_frameworks on delete cascade,
  ref text not null,
  title text not null,
  owner_id uuid references auth.users on delete set null,
  status text not null default 'not_started'
    check (status in ('passing', 'failing', 'in_review', 'not_started', 'not_applicable')),
  last_reviewed_at timestamptz,
  notes text
);
create index on public.compliance_controls (framework_id);
create index on public.compliance_controls (org_id, status);

create table public.compliance_evidence (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  control_id uuid not null references public.compliance_controls on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references auth.users on delete set null default auth.uid(),
  valid_until date
);
create index on public.compliance_evidence (control_id);

create table public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  title text not null,
  category text not null default 'nda' check (category in ('nda', 'ip', 'contract', 'other')),
  file_path text not null,
  uploaded_by uuid references auth.users on delete set null default auth.uid()
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  title text not null,
  version text not null default '1.0',
  body_md text not null default '',
  published_at timestamptz
);

create table public.dsar_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  requester_email text not null,
  type text not null check (type in ('access', 'erasure', 'rectification', 'portability')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  due_on date not null default (current_date + 30)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  owner_id uuid references auth.users on delete set null,
  name text not null,
  os text not null default 'macOS',
  encrypted boolean not null default false,
  agent_installed boolean not null default false,
  last_seen_on date
);
create index on public.devices (org_id);

create table public.training_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  title text not null,
  due_on date not null
);

create table public.training_assignments (
  campaign_id uuid not null references public.training_campaigns on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  completed_at timestamptz,
  last_reminded_at timestamptz,
  primary key (campaign_id, user_id)
);

-- ───────────────────────── Platform ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz
);
create index on public.notifications (user_id, read_at, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  actor_id uuid references auth.users on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}',
  ip text,
  user_agent text
);
create index on public.audit_log (org_id, created_at desc);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('slack_webhook', 'github')),
  enabled boolean not null default true,
  config jsonb not null default '{}',
  unique (org_id, kind)
);

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  cadence text not null check (cadence in ('weekly', 'monthly')),
  weekday int check (weekday between 0 and 6),
  month_day int check (month_day between 1 and 28),
  hour_utc int not null default 7 check (hour_utc between 0 and 23),
  destination text not null check (destination in ('email', 'slack')),
  recipients text[] not null default '{}',
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text
);

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  created_by uuid references auth.users on delete set null,
  plan text not null check (plan in ('starter', 'pro', 'enterprise')),
  period text not null check (period in ('monthly', 'annual')),
  seats int not null,
  amount_minor bigint not null,
  currency text not null check (currency in ('KES', 'USD')),
  method text not null check (method in ('MPESA', 'CARD')),
  api_ref text not null unique,
  intasend_invoice_id text,
  intasend_checkout_id text,
  state text not null default 'PENDING' check (state in ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED')),
  applied_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  raw jsonb not null default '{}'
);
create index on public.billing_payments (org_id, created_at desc);

create table public.passkeys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  label text not null default 'Passkey'
);

create table public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users on delete cascade,
  email text,
  challenge text not null,
  kind text not null check (kind in ('register', 'login'))
);

create table public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  taken_on date not null default current_date,
  score int not null,
  components jsonb not null default '{}',
  unique (org_id, taken_on)
);

-- ──────────────────────────── 20261008000002_rls.sql ────────────────────────────
-- Row Level Security: the real tenant-isolation boundary.
-- Helper functions are SECURITY DEFINER so policies never recurse into memberships' own RLS.

create or replace function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.memberships
  where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and status = 'active'
  )
$$;

create or replace function public.has_org_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role(p_org) = any (p_roles), false)
$$;

-- An org is writable while active and within a 3-day grace period after plan expiry.
create or replace function public.org_is_writable(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org and status = 'active' and plan_expires_at > now() - interval '3 days'
  )
$$;

create or replace function public.can_write(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_org_role(p_org, p_roles) and public.org_is_writable(p_org)
$$;

-- Users who share at least one active org with the caller (for profile visibility).
create or replace function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user and b.status = 'active'
  )
$$;

-- Role shorthands
-- ALL_WRITERS  = owner, director, contributor  (auditor is always read-only)
-- MANAGERS     = owner, director

-- ───────── Enable RLS everywhere ─────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ───────── organizations ─────────
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
-- Clients may only update settings columns; billing/plan/status/SSO columns are server-only.
create policy org_update on public.organizations for update to authenticated
  using (public.can_write(id, array['owner', 'director']))
  with check (public.can_write(id, array['owner', 'director']));
revoke insert, update, delete on public.organizations from authenticated, anon;
grant update (name, legal_name, currency, core_window_start, core_window_end,
  golden_overlap_min_hours, quiet_hours, auto_detect_timezone,
  expense_approval_threshold_minor, hourly_cost_minor, seat_autoscale)
  on public.organizations to authenticated;

-- ───────── profiles ─────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from authenticated, anon;

-- ───────── memberships (writes go through RPCs / server routes only) ─────────
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(org_id));
revoke insert, update, delete on public.memberships from authenticated, anon;

-- ───────── invites (created by server route so the email can be sent) ─────────
create policy invites_select on public.invites for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'director']));
create policy invites_delete on public.invites for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'director']));
revoke insert, update on public.invites from authenticated, anon;

-- ───────── Generic: members read, managers write ─────────
do $$
declare t text;
begin
  foreach t in array array['legal_entities', 'sprints', 'payroll_runs', 'channels', 'polls',
    'poll_options', 'lounges', 'compliance_frameworks', 'compliance_controls', 'policies',
    'dsar_requests', 'training_campaigns', 'report_schedules'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
      using (public.is_org_member(org_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.can_write(org_id, array['owner','director']))
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.can_write(org_id, array['owner','director']))$f$, t);
  end loop;
end $$;

-- Lounges: contributors start/stop a shared focus session via set_lounge_session() (0003).

-- ───────── finance: managers only (contributors see dashboard summaries via RPC) ─────────
do $$
declare t text;
begin
  foreach t in array array['finance_entries', 'invoices'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
      using (public.has_org_role(org_id, array['owner','director','auditor']))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
      using (public.can_write(org_id, array['owner','director']))
      with check (public.can_write(org_id, array['owner','director']))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.can_write(org_id, array['owner','director']))$f$, t);
  end loop;
end $$;
-- Payment-derived invoice fields are server-only.
revoke update on public.invoices from authenticated;
grant update (client_name, client_email, description, amount_minor, currency, terms_days,
  issued_on, due_on, status) on public.invoices to authenticated;
-- Only owners approve spend.
revoke update on public.finance_entries from authenticated;
grant update (amount_minor, currency, category, vendor, occurred_on, note, approval_status, approved_by)
  on public.finance_entries to authenticated;

-- ───────── tasks: any writer creates; managers edit all; contributors edit own/assigned ─────────
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_org_member(org_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_write(org_id, array['owner','director','contributor']) and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_write(org_id, array['owner','director'])
    or (public.can_write(org_id, array['contributor']) and (assignee_id = auth.uid() or created_by = auth.uid())))
  with check (public.can_write(org_id, array['owner','director','contributor']));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_write(org_id, array['owner','director']) or (created_by = auth.uid() and public.can_write(org_id, array['contributor'])));

-- ───────── meetings ─────────
create policy meetings_select on public.meetings for select to authenticated
  using (public.is_org_member(org_id));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.can_write(org_id, array['owner','director','contributor']) and organizer_id = auth.uid());
create policy meetings_update on public.meetings for update to authenticated
  using (organizer_id = auth.uid() or public.can_write(org_id, array['owner','director']))
  with check (public.can_write(org_id, array['owner','director','contributor']));
create policy meetings_delete on public.meetings for delete to authenticated
  using (organizer_id = auth.uid() or public.can_write(org_id, array['owner','director']));

create policy mp_select on public.meeting_participants for select to authenticated
  using (public.is_org_member(org_id));
create policy mp_insert on public.meeting_participants for insert to authenticated
  with check (public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.meetings m where m.id = meeting_participants.meeting_id and m.org_id = meeting_participants.org_id
      and (m.organizer_id = auth.uid() or public.has_org_role(m.org_id, array['owner','director'])))
    and public.shares_org_with(meeting_participants.user_id));
create policy mp_update on public.meeting_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mp_delete on public.meeting_participants for delete to authenticated
  using (exists (select 1 from public.meetings m where m.id = meeting_participants.meeting_id
    and (m.organizer_id = auth.uid() or public.has_org_role(m.org_id, array['owner','director']))));

-- ───────── check-ins: own rows ─────────
create policy checkins_select on public.check_ins for select to authenticated
  using (public.is_org_member(org_id));
create policy checkins_insert on public.check_ins for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor']));
create policy checkins_update on public.check_ins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.org_is_writable(org_id));

-- ───────── messages ─────────
create policy messages_select on public.messages for select to authenticated
  using (public.is_org_member(org_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid()
    and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.channels c where c.id = messages.channel_id and c.org_id = messages.org_id
      and (not c.is_announcement or public.has_org_role(c.org_id, array['owner','director']))));
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid() or public.can_write(org_id, array['owner','director']))
  with check (public.org_is_writable(org_id));
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.can_write(org_id, array['owner','director']));

create policy mr_select on public.message_reactions for select to authenticated
  using (public.is_org_member(org_id));
create policy mr_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id and m.org_id = message_reactions.org_id));
create policy mr_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ───────── polls: votes are private; tallies come from poll_results() ─────────
create policy votes_select on public.poll_votes for select to authenticated
  using (user_id = auth.uid());
create policy votes_insert on public.poll_votes for insert to authenticated
  with check (user_id = auth.uid()
    and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.polls p join public.poll_options o on o.poll_id = p.id
      where p.id = poll_votes.poll_id and o.id = poll_votes.option_id and p.org_id = poll_votes.org_id
        and (p.closes_at is null or p.closes_at > now())));
create policy votes_delete on public.poll_votes for delete to authenticated
  using (user_id = auth.uid());

-- ───────── kudos ─────────
create policy kudos_select on public.kudos for select to authenticated
  using (public.is_org_member(org_id));
create policy kudos_insert on public.kudos for insert to authenticated
  with check (from_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.memberships m where m.org_id = kudos.org_id and m.user_id = kudos.to_id and m.status = 'active'));
create policy kudos_delete on public.kudos for delete to authenticated
  using (from_id = auth.uid() or public.can_write(org_id, array['owner','director']));

create policy kr_select on public.kudos_reactions for select to authenticated
  using (public.is_org_member(org_id));
create policy kr_insert on public.kudos_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.kudos k where k.id = kudos_reactions.kudos_id and k.org_id = kudos_reactions.org_id));
create policy kr_delete on public.kudos_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ───────── compliance evidence, vault, devices, training ─────────
create policy evidence_select on public.compliance_evidence for select to authenticated
  using (public.is_org_member(org_id));
create policy evidence_insert on public.compliance_evidence for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy evidence_delete on public.compliance_evidence for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

create policy vault_select on public.vault_documents for select to authenticated
  using (public.has_org_role(org_id, array['owner','director']));
-- (file contents additionally require an AAL2/MFA session — see storage policies)
create policy vault_insert on public.vault_documents for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy vault_delete on public.vault_documents for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

create policy devices_select on public.devices for select to authenticated
  using (public.is_org_member(org_id));
create policy devices_insert on public.devices for insert to authenticated
  with check (public.can_write(org_id, array['owner','director'])
    or (owner_id = auth.uid() and public.can_write(org_id, array['contributor'])));
create policy devices_update on public.devices for update to authenticated
  using (public.can_write(org_id, array['owner','director'])
    or (owner_id = auth.uid() and public.can_write(org_id, array['contributor'])))
  with check (public.org_is_writable(org_id));
create policy devices_delete on public.devices for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

create policy ta_select on public.training_assignments for select to authenticated
  using (public.is_org_member(org_id));
create policy ta_insert on public.training_assignments for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy ta_update on public.training_assignments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.training_assignments from authenticated;
grant update (completed_at) on public.training_assignments to authenticated;
create policy ta_delete on public.training_assignments for delete to authenticated
  using (public.can_write(org_id, array['owner','director']));

-- ───────── notifications: own only; created by triggers/server ─────────
create policy notif_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from authenticated, anon;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ───────── audit log: read-only for owner/director/auditor; NEVER client-writable ─────────
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_org_role(org_id, array['owner','director','auditor']));
revoke insert, update, delete on public.audit_log from authenticated, anon;

-- ───────── integrations: managers ─────────
create policy integ_select on public.integrations for select to authenticated
  using (public.has_org_role(org_id, array['owner','director']));
create policy integ_write on public.integrations for all to authenticated
  using (public.can_write(org_id, array['owner','director']))
  with check (public.can_write(org_id, array['owner','director']));

-- ───────── billing: owner/auditor read; NEVER client-writable ─────────
create policy billing_select on public.billing_payments for select to authenticated
  using (public.has_org_role(org_id, array['owner','auditor']));
revoke insert, update, delete on public.billing_payments from authenticated, anon;

-- ───────── passkeys: own read/delete; created server-side after verification ─────────
create policy passkeys_select on public.passkeys for select to authenticated
  using (user_id = auth.uid());
create policy passkeys_delete on public.passkeys for delete to authenticated
  using (user_id = auth.uid());
revoke insert, update on public.passkeys from authenticated, anon;

-- webauthn challenges: server-only (no policies => no access for clients)
revoke all on public.webauthn_challenges from authenticated, anon;

-- health snapshots: members read; server writes
create policy hs_select on public.health_snapshots for select to authenticated
  using (public.is_org_member(org_id));
revoke insert, update, delete on public.health_snapshots from authenticated, anon;

-- anon gets nothing on any table
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ──────────────────────────── 20261008000003_functions.sql ────────────────────────────
-- RPCs and triggers. Anything that must be atomic or must bypass a client-write block lives here.

-- Let PostgREST embed profiles from memberships (profiles are created by trigger before any membership).
alter table public.memberships
  add constraint memberships_user_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;

-- ───────── internal helpers (not callable by clients) ─────────
create or replace function public._audit(p_org uuid, p_action text, p_target_type text, p_target_id text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, metadata)
  values (p_org, auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_meta, '{}'));
$$;

create or replace function public._notify(p_org uuid, p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (org_id, user_id, kind, title, body, link)
  values (p_org, p_user, p_kind, p_title, p_body, p_link);
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ───────── new auth user -> profile ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, timezone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Africa/Nairobi')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ───────── org_id is immutable on every tenant table (blocks cross-tenant moves) ─────────
create or replace function public.prevent_org_change()
returns trigger language plpgsql as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'org_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_org_change()',
      t || '_org_immutable', t);
  end loop;
end $$;

-- ───────── messages: only managers may pin; editing your own body stamps edited_at ─────────
create or replace function public.guard_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pinned is distinct from old.pinned and not public.has_org_role(new.org_id, array['owner','director']) then
    raise exception 'only owners and directors can pin messages' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if old.author_id <> auth.uid() then
      raise exception 'you can only edit your own messages' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  if new.author_id is distinct from old.author_id or new.channel_id is distinct from old.channel_id then
    raise exception 'author and channel are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger messages_guard before update on public.messages for each row execute function public.guard_message_update();

-- ───────── tasks: completion timestamp + assignment notifications ─────────
create or replace function public.task_before_write()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.status <> 'blocked' then
    new.blocked_reason := null;
  end if;
  return new;
end $$;
create trigger tasks_before_write before insert or update on public.tasks for each row execute function public.task_before_write();

create or replace function public.task_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public._notify(new.org_id, new.assignee_id, 'task_assigned', 'New task assigned', new.title, '/operations/tasks/' || new.id);
  end if;
  return null;
end $$;
create trigger tasks_after_write after insert or update on public.tasks for each row execute function public.task_after_write();

-- ───────── kudos -> notify recipient ─────────
create or replace function public.kudos_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  select full_name into v_from from public.profiles where id = new.from_id;
  perform public._notify(new.org_id, new.to_id, 'kudos', coalesce(v_from, 'A teammate') || ' sent you kudos', new.message, '/culture?tab=kudos');
  return null;
end $$;
create trigger kudos_notify after insert on public.kudos for each row execute function public.kudos_after_insert();

-- ───────── audit triggers ─────────
create or replace function public.audit_memberships()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._audit(new.org_id, 'member.added', 'membership', new.user_id::text, jsonb_build_object('role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public._audit(new.org_id, 'member.role_changed', 'membership', new.user_id::text, jsonb_build_object('from', old.role, 'to', new.role));
    end if;
    if new.status is distinct from old.status then
      perform public._audit(new.org_id, 'member.' || new.status, 'membership', new.user_id::text, '{}');
    end if;
  end if;
  return null;
end $$;
create trigger memberships_audit after insert or update on public.memberships for each row execute function public.audit_memberships();

create or replace function public.audit_org_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_changes jsonb := '{}'; v_key text; v_old jsonb := to_jsonb(old); v_new jsonb := to_jsonb(new);
begin
  for v_key in select jsonb_object_keys(v_new) loop
    if v_new -> v_key is distinct from v_old -> v_key then
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
    end if;
  end loop;
  if v_changes <> '{}' then
    perform public._audit(new.id, 'org.settings_updated', 'organization', new.id::text, v_changes);
  end if;
  return null;
end $$;
create trigger organizations_audit after update on public.organizations for each row execute function public.audit_org_update();

create or replace function public.audit_generic_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_col text := tg_argv[0]; v_old text; v_new text;
begin
  v_old := to_jsonb(old) ->> v_col; v_new := to_jsonb(new) ->> v_col;
  if v_old is distinct from v_new then
    perform public._audit(new.org_id, tg_table_name || '.' || v_col || '_changed', tg_table_name, new.id::text,
      jsonb_build_object('from', v_old, 'to', v_new));
  end if;
  return null;
end $$;
create trigger controls_audit after update on public.compliance_controls for each row execute function public.audit_generic_status('status');
create trigger finance_audit after update on public.finance_entries for each row execute function public.audit_generic_status('approval_status');
create trigger invoices_audit after update on public.invoices for each row execute function public.audit_generic_status('status');

-- ───────── RPC: create an organization (bootstrap: caller becomes owner atomically) ─────────
create or replace function public.create_organization(p_name text, p_slug text, p_currency text default 'KES')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_slug !~ '^[a-z0-9-]{3,40}$' then raise exception 'invalid slug' using errcode = '22023'; end if;
  if p_currency not in ('KES', 'USD') then raise exception 'invalid currency' using errcode = '22023'; end if;
  if exists (select 1 from public.organizations where slug = p_slug) then
    raise exception 'slug already taken' using errcode = '23505';
  end if;
  -- profile is normally created by the auth trigger; make sure it exists
  insert into public.profiles (id) values (v_uid) on conflict do nothing;

  insert into public.organizations (name, slug, currency, owner_id)
  values (trim(p_name), p_slug, p_currency, v_uid) returning id into v_org;
  insert into public.memberships (org_id, user_id, role, title) values (v_org, v_uid, 'owner', 'Founder');

  insert into public.channels (org_id, slug, name, topic, is_announcement) values
    (v_org, 'announcements', 'announcements', 'Company-wide updates', true),
    (v_org, 'general', 'general', 'Day-to-day async discussion', false),
    (v_org, 'random-watercooler', 'random-watercooler', 'Off-topic, pets and plants', false);
  insert into public.lounges (org_id, name, description, kind) values
    (v_org, 'Casual Coffee & Beats', 'Drop-in hangout between time zones', 'hangout'),
    (v_org, 'Deep Coworking', 'Shared focus sprints, mics muted', 'focus');

  perform public._audit(v_org, 'org.created', 'organization', v_org::text, jsonb_build_object('slug', p_slug));
  return v_org;
end $$;

create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9-]{3,40}$' and not exists (select 1 from public.organizations where slug = p_slug)
$$;

-- Login page tenant lookup (anon-callable; returns only public-safe fields)
create or replace function public.org_by_slug(p_slug text)
returns table (name text, slug text, sso_domain text)
language sql stable security definer set search_path = public as $$
  select o.name, o.slug, o.sso_domain from public.organizations o
  where o.slug = lower(p_slug) and o.status <> 'offboarding'
$$;

-- ───────── RPC: redeem an invite (email + expiry + seat limit, atomically) ─────────
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.invites; v_email text; v_org public.organizations; v_used int;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.invites where code = p_code for update;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if v_inv.accepted_at is not null then raise exception 'invite already used' using errcode = '22023'; end if;
  if v_inv.expires_at < now() then raise exception 'invite expired' using errcode = '22023'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_inv.email) then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = v_inv.org_id for update;
  if not public.org_is_writable(v_org.id) then raise exception 'workspace is read-only' using errcode = '42501'; end if;
  select count(*) into v_used from public.memberships where org_id = v_org.id and status = 'active';
  if v_used >= v_org.seat_limit then raise exception 'no seats available' using errcode = '53400'; end if;

  insert into public.profiles (id, email) values (auth.uid(), v_email) on conflict do nothing;
  insert into public.memberships (org_id, user_id, role) values (v_org.id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role, status = 'active';
  update public.invites set accepted_at = now() where id = v_inv.id;
  return v_org.id;
end $$;

-- ───────── RPC: poll tallies without exposing who voted ─────────
create or replace function public.poll_results(p_poll uuid)
returns table (option_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select o.id, count(v.user_id)
  from public.poll_options o
  join public.polls p on p.id = o.poll_id
  left join public.poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll and public.is_org_member(p.org_id)
  group by o.id
$$;

-- ───────── RPC: monthly finance aggregates (members may see summaries, not ledger rows) ─────────
create or replace function public.finance_monthly(p_org uuid, p_months int default 6)
returns table (month date, kind text, total_minor bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', f.occurred_on)::date, f.kind, sum(f.amount_minor)::bigint
  from public.finance_entries f
  join public.organizations o on o.id = f.org_id
  where f.org_id = p_org and public.is_org_member(p_org)
    and f.currency = o.currency and f.approval_status = 'approved'
    and f.kind <> 'cash_balance'
    and f.occurred_on >= (date_trunc('month', current_date) - make_interval(months => p_months - 1))::date
  group by 1, 2
  union all
  select * from (
    select f.occurred_on, 'cash_balance'::text, f.amount_minor
    from public.finance_entries f join public.organizations o on o.id = f.org_id
    where f.org_id = p_org and public.is_org_member(p_org) and f.kind = 'cash_balance' and f.currency = o.currency
    order by f.occurred_on desc, f.created_at desc limit 1
  ) latest
$$;

-- ───────── RPC: shared focus session for lounges ─────────
create or replace function public.set_lounge_session(p_lounge uuid, p_start boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_at timestamptz;
begin
  select org_id into v_org from public.lounges where id = p_lounge;
  if v_org is null or not public.can_write(v_org, array['owner','director','contributor']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_at := case when p_start then now() else null end;
  update public.lounges set session_started_at = v_at where id = p_lounge;
  return v_at;
end $$;

-- ───────── RPC (service role only): apply an IntaSend platform payment, idempotently ─────────
create or replace function public.apply_intasend_payment(p_api_ref text, p_state text, p_invoice_id text, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_pay public.billing_payments; v_org public.organizations; v_start timestamptz; v_end timestamptz; r record;
begin
  if p_state not in ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED') then
    raise exception 'invalid state %', p_state using errcode = '22023';
  end if;
  select * into v_pay from public.billing_payments where api_ref = p_api_ref for update;
  if not found then return 'unknown_ref'; end if;
  if v_pay.applied_at is not null then return 'already_applied'; end if;

  update public.billing_payments
     set state = p_state, raw = coalesce(p_raw, '{}'),
         intasend_invoice_id = coalesce(p_invoice_id, intasend_invoice_id)
   where id = v_pay.id;

  if p_state <> 'COMPLETE' then
    return lower(p_state);
  end if;

  select * into v_org from public.organizations where id = v_pay.org_id for update;
  v_start := greatest(now(), v_org.plan_expires_at);
  v_end := v_start + case when v_pay.period = 'annual' then interval '1 year' else interval '1 month' end;

  update public.organizations
     set plan = v_pay.plan, plan_period = v_pay.period, seat_limit = v_pay.seats,
         plan_expires_at = v_end,
         status = case when status = 'suspended' then 'active' else status end
   where id = v_org.id;
  update public.billing_payments
     set applied_at = now(), period_start = v_start, period_end = v_end
   where id = v_pay.id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, metadata)
  values (v_org.id, v_pay.created_by, 'billing.payment_applied', 'billing_payment', v_pay.id::text,
          jsonb_build_object('plan', v_pay.plan, 'period', v_pay.period, 'seats', v_pay.seats,
                             'amount_minor', v_pay.amount_minor, 'currency', v_pay.currency, 'until', v_end));
  for r in select user_id from public.memberships where org_id = v_org.id and role = 'owner' and status = 'active' loop
    perform public._notify(v_org.id, r.user_id, 'payment', 'Payment received',
      initcap(v_pay.plan) || ' plan active until ' || to_char(v_end, 'DD Mon YYYY'), '/settings/billing');
  end loop;
  return 'applied';
end $$;

-- ───────── RPC (service role only): mark a client invoice paid ─────────
create or replace function public.apply_invoice_payment(p_invoice uuid, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_inv public.invoices;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then return 'unknown_invoice'; end if;
  if v_inv.status = 'paid' then return 'already_paid'; end if;
  update public.invoices set status = 'paid', paid_at = now() where id = v_inv.id;
  insert into public.finance_entries (org_id, kind, amount_minor, currency, category, vendor, note, created_by)
  values (v_inv.org_id, 'revenue', v_inv.amount_minor, v_inv.currency, 'Invoice', v_inv.client_name,
          'Invoice ' || v_inv.number || ' paid via IntaSend', v_inv.created_by);
  if v_inv.created_by is not null then
    perform public._notify(v_inv.org_id, v_inv.created_by, 'invoice_paid', 'Invoice ' || v_inv.number || ' paid',
      v_inv.client_name, '/operations/invoices/' || v_inv.id);
  end if;
  return 'applied';
end $$;

-- ───────── RPC (service role only): audit log retention ─────────
create or replace function public.purge_audit_log()
returns bigint language plpgsql security definer set search_path = public as $$
declare v_count bigint;
begin
  delete from public.audit_log a using public.organizations o
  where a.org_id = o.id and a.created_at < now() - make_interval(years => o.audit_retention_years);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ───────── Execute grants ─────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.org_role(uuid), public.is_org_member(uuid), public.has_org_role(uuid, text[]),
  public.org_is_writable(uuid), public.can_write(uuid, text[]), public.shares_org_with(uuid), public.try_uuid(text),
  public.create_organization(text, text, text), public.slug_available(text), public.redeem_invite(text),
  public.poll_results(uuid), public.finance_monthly(uuid, int), public.set_lounge_session(uuid, boolean)
  to authenticated;
grant execute on function public.org_by_slug(text) to anon, authenticated;
grant execute on function public.try_uuid(text) to anon;
grant execute on all functions in schema public to service_role;

-- ───────── Realtime ─────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.tasks, public.notifications,
      public.kudos, public.check_ins, public.lounges, public.message_reactions, public.kudos_reactions;
  end if;
end $$;

-- ──────────────────────────── 20261008000004_storage.sql ────────────────────────────
-- Storage buckets. Object paths are always "<org_id>/..." (avatars: "<user_id>/...").
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('evidence', 'evidence', false),
  ('vault', 'vault', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "avatars read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "evidence read members" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.is_org_member(public.try_uuid((storage.foldername(name))[1])));
create policy "evidence write managers" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "evidence delete managers" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));

-- Vault requires an MFA-verified session (AAL2).
create policy "vault read managers" on storage.objects for select to authenticated
  using (bucket_id = 'vault' and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "vault write managers" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "vault delete managers" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
-- 'exports' has no client policies: only the service role writes and signs URLs.

-- ──────────────────────────── 20261008000005_activity.sql ────────────────────────────
-- Team activity stream (Operations → Team Activity). Written by triggers and server integrations
-- (e.g. GitHub webhooks); members read. Never client-writable.
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  actor_id uuid references auth.users on delete set null,
  actor_name text,
  kind text not null,          -- task_done | checkin | kudos | invoice_paid | expense_approved | github_pr_merged | github_push
  title text not null,
  body text,
  link text
);
create index on public.activity_events (org_id, created_at desc);
alter table public.activity_events enable row level security;
alter table public.activity_events force row level security;
create policy activity_select on public.activity_events for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.activity_events from authenticated, anon;
revoke all on public.activity_events from anon;
create trigger activity_events_org_immutable before update on public.activity_events for each row execute function public.prevent_org_change();

create or replace function public._activity(p_org uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_events (org_id, actor_id, actor_name, kind, title, body, link)
  values (p_org, p_actor, (select full_name from public.profiles where id = p_actor), p_kind, p_title, p_body, p_link);
$$;
revoke execute on function public._activity(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.activity_from_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    perform public._activity(new.org_id, coalesce(new.assignee_id, auth.uid()), 'task_done', 'Completed “' || new.title || '”',
      new.points || ' pts', '/operations/tasks/' || new.id);
  end if;
  return null;
end $$;
create trigger tasks_activity after insert or update on public.tasks for each row execute function public.activity_from_task();

create or replace function public.activity_from_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._activity(new.org_id, new.user_id, 'checkin', 'Submitted async check-in', left(new.shipped, 140), '/culture?tab=roll-call');
  return null;
end $$;
create trigger checkins_activity after insert on public.check_ins for each row execute function public.activity_from_checkin();

create or replace function public.activity_from_kudos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._activity(new.org_id, new.from_id, 'kudos',
    'Gave kudos to ' || coalesce((select full_name from public.profiles where id = new.to_id), 'a teammate'), left(new.message, 140), '/culture?tab=kudos');
  return null;
end $$;
create trigger kudos_activity after insert on public.kudos for each row execute function public.activity_from_kudos();

create or replace function public.activity_from_finance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status = 'approved' and old.approval_status = 'pending' then
    perform public._activity(new.org_id, auth.uid(), 'expense_approved', 'Approved ' || coalesce(new.vendor, new.category, 'an expense'), null, '/operations?tab=finance');
  end if;
  return null;
end $$;
create trigger finance_activity after update on public.finance_entries for each row execute function public.activity_from_finance();

-- invoice payments are applied by apply_invoice_payment(); log them there too
create or replace function public.activity_from_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    perform public._activity(new.org_id, new.created_by, 'invoice_paid', 'Invoice ' || new.number || ' paid', new.client_name, '/operations/invoices/' || new.id);
  end if;
  return null;
end $$;
create trigger invoices_activity after update on public.invoices for each row execute function public.activity_from_invoice();

-- Expenses above the workspace threshold are created as 'pending' regardless of what the client sends;
-- only owners/directors can approve (column grant + policy), and nobody approves their own entry.
create or replace function public.finance_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_threshold bigint;
begin
  if tg_op = 'INSERT' then
    select expense_approval_threshold_minor into v_threshold from public.organizations where id = new.org_id;
    if new.kind = 'expense' and new.amount_minor > v_threshold and auth.uid() is not null then
      new.approval_status := 'pending';
      new.approved_by := null;
    elsif auth.uid() is not null then
      new.approval_status := 'approved';
    end if;
  elsif new.approval_status is distinct from old.approval_status then
    if auth.uid() is not null and old.created_by = auth.uid() and new.approval_status = 'approved' then
      raise exception 'you cannot approve your own expense' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
  end if;
  return new;
end $$;
create trigger finance_before_write before insert or update on public.finance_entries for each row execute function public.finance_before_write();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end $$;

-- backfill so existing workspaces have a stream
insert into public.activity_events (org_id, actor_id, actor_name, kind, title, body, link, created_at)
select t.org_id, t.assignee_id, p.full_name, 'task_done', 'Completed “' || t.title || '”', t.points || ' pts', '/operations/tasks/' || t.id, t.completed_at
from public.tasks t left join public.profiles p on p.id = t.assignee_id
where t.status = 'done' and t.completed_at is not null;

-- ──────────────────────────── 20261008000006_currencies.sql ────────────────────────────
-- ───────── Currencies: add EUR and GBP alongside KES and USD ─────────
-- M-Pesa still settles in KES; cards and client invoices can use any of the four.
do $$
declare t text;
begin
  foreach t in array array['organizations', 'finance_entries', 'invoices', 'payroll_runs', 'billing_payments'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_currency_check');
    execute format('alter table public.%I add constraint %I check (currency in (''KES'', ''USD'', ''EUR'', ''GBP''))', t, t || '_currency_check');
  end loop;
end $$;

create or replace function public.create_organization(p_name text, p_slug text, p_currency text default 'KES')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_slug !~ '^[a-z0-9-]{3,40}$' then raise exception 'invalid slug' using errcode = '22023'; end if;
  if p_currency not in ('KES', 'USD', 'EUR', 'GBP') then raise exception 'invalid currency' using errcode = '22023'; end if;
  if exists (select 1 from public.organizations where slug = p_slug) then
    raise exception 'slug already taken' using errcode = '23505';
  end if;
  -- profile is normally created by the auth trigger; make sure it exists
  insert into public.profiles (id) values (v_uid) on conflict do nothing;

  insert into public.organizations (name, slug, currency, owner_id)
  values (trim(p_name), p_slug, p_currency, v_uid) returning id into v_org;
  insert into public.memberships (org_id, user_id, role, title) values (v_org, v_uid, 'owner', 'Founder');

  insert into public.channels (org_id, slug, name, topic, is_announcement) values
    (v_org, 'announcements', 'announcements', 'Company-wide updates', true),
    (v_org, 'general', 'general', 'Day-to-day async discussion', false),
    (v_org, 'random-watercooler', 'random-watercooler', 'Off-topic, pets and plants', false);
  insert into public.lounges (org_id, name, description, kind) values
    (v_org, 'Casual Coffee & Beats', 'Drop-in hangout between time zones', 'hangout'),
    (v_org, 'Deep Coworking', 'Shared focus sprints, mics muted', 'focus');

  perform public._audit(v_org, 'org.created', 'organization', v_org::text, jsonb_build_object('slug', p_slug));
  return v_org;
end $$;

-- ──────────────────────────── 20261009000007_differentiators.sql ────────────────────────────
-- ════════════════════════════════════════════════════════════════════════════
-- 0007 — WhatsApp, M-Pesa payouts, languages, data saver, AI chief-of-staff
-- ════════════════════════════════════════════════════════════════════════════

-- ───────── profile preferences ─────────
alter table public.profiles
  add column if not exists language text not null default 'en' check (language in ('en', 'sw', 'fr')),
  add column if not exists data_saver boolean not null default false,
  add column if not exists whatsapp_checkins boolean not null default true,
  add column if not exists whatsapp_approvals boolean not null default true;

-- Users may edit their own preferences, but not `email` (emails are sent to it) — column grants.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, timezone, work_start, work_end, city, country_code, theme,
  email_notifications, checkin_reminders, language, data_saver, whatsapp_checkins, whatsapp_approvals)
  on public.profiles to authenticated;

-- ───────── WhatsApp ─────────
-- Verified numbers live apart from profiles, because teammates can read each other's profiles.
create table public.whatsapp_links (
  user_id uuid primary key references auth.users on delete cascade,
  phone text not null unique check (phone ~ '^[1-9][0-9]{7,14}$'),   -- E.164 digits, no "+"
  verified_at timestamptz not null default now()
);
alter table public.whatsapp_links enable row level security;
create policy whatsapp_links_own on public.whatsapp_links for select to authenticated using (user_id = auth.uid());
create policy whatsapp_links_delete_own on public.whatsapp_links for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.whatsapp_links from authenticated, anon;

create table public.whatsapp_verifications (
  user_id uuid primary key references auth.users on delete cascade,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_verifications enable row level security;   -- service role only

-- What we last asked each person (so a free-text reply can be matched to a check-in prompt).
create table public.whatsapp_prompts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('checkin', 'approval', 'brief')),
  ref_id uuid
);
create index on public.whatsapp_prompts (user_id, created_at desc);
alter table public.whatsapp_prompts enable row level security;         -- service role only

-- Inbound message ids, so Meta's retries are processed once.
create table public.whatsapp_inbound (
  wa_message_id text primary key,
  received_at timestamptz not null default now(),
  from_phone text not null,
  user_id uuid references auth.users on delete set null,
  handled_as text
);
alter table public.whatsapp_inbound enable row level security;         -- service role only

-- Expense approvals made outside the browser must still be attributed to the person, so the
-- finance trigger keeps an approved_by set by a trusted server path when there is no JWT.
create or replace function public.finance_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_threshold bigint;
begin
  if tg_op = 'INSERT' then
    select expense_approval_threshold_minor into v_threshold from public.organizations where id = new.org_id;
    if new.kind = 'expense' and new.amount_minor > v_threshold and auth.uid() is not null then
      new.approval_status := 'pending';
      new.approved_by := null;
    elsif auth.uid() is not null then
      new.approval_status := 'approved';
    end if;
  elsif new.approval_status is distinct from old.approval_status then
    if auth.uid() is not null and old.created_by = auth.uid() and new.approval_status = 'approved' then
      raise exception 'you cannot approve your own expense' using errcode = '42501';
    end if;
    new.approved_by := coalesce(auth.uid(), new.approved_by);
  end if;
  return new;
end $$;

-- Runs a statement block as a given user: sets the JWT claims for this transaction so triggers,
-- auth.uid() and the audit log see that person (used only by server-side, service-role RPCs).
create or replace function public._act_as(p_user uuid)
returns void language sql security definer set search_path = public as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('request.jwt.claim.sub', p_user::text, true);
$$;
revoke all on function public._act_as(uuid) from public, anon, authenticated;

-- Approve/reject an expense from WhatsApp. Same rules as the app: owner/director of the
-- workspace, workspace writable, never your own expense, only pending ones.
create or replace function public.decide_expense_as(p_user uuid, p_expense uuid, p_decision text)
returns text language plpgsql security definer set search_path = public as $$
declare v_row public.finance_entries; v_role text;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid decision' using errcode = '22023'; end if;
  select * into v_row from public.finance_entries where id = p_expense for update;
  if not found then return 'not_found'; end if;
  if v_row.approval_status <> 'pending' then return 'already_' || v_row.approval_status; end if;
  select role into v_role from public.memberships where org_id = v_row.org_id and user_id = p_user and status = 'active';
  if v_role is null or v_role not in ('owner', 'director') then return 'forbidden'; end if;
  if not public.org_is_writable(v_row.org_id) then return 'read_only'; end if;
  if v_row.created_by = p_user then return 'own_expense'; end if;
  perform public._act_as(p_user);
  update public.finance_entries set approval_status = p_decision, approved_by = p_user where id = p_expense;
  return p_decision;
end $$;
revoke all on function public.decide_expense_as(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_expense_as(uuid, uuid, text) to service_role;

-- Save a WhatsApp reply as today's check-in (in the person's own time zone).
create or replace function public.checkin_as(p_user uuid, p_org uuid, p_shipped text, p_blockers text, p_mood int)
returns text language plpgsql security definer set search_path = public as $$
declare v_role text; v_tz text; v_day date;
begin
  select role into v_role from public.memberships where org_id = p_org and user_id = p_user and status = 'active';
  if v_role is null or v_role = 'auditor' then return 'forbidden'; end if;
  if not public.org_is_writable(p_org) then return 'read_only'; end if;
  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = p_user;
  v_day := (now() at time zone v_tz)::date;
  perform public._act_as(p_user);
  insert into public.check_ins (org_id, user_id, for_date, shipped, blockers, mood)
  values (p_org, p_user, v_day, left(p_shipped, 2000), nullif(left(coalesce(p_blockers, ''), 2000), ''), greatest(1, least(5, coalesce(p_mood, 3))))
  on conflict (org_id, user_id, for_date) do update
    set shipped = excluded.shipped, blockers = coalesce(excluded.blockers, public.check_ins.blockers), mood = excluded.mood;
  return 'saved';
end $$;
revoke all on function public.checkin_as(uuid, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.checkin_as(uuid, uuid, text, text, int) to service_role;

-- ───────── M-Pesa payroll payouts (maker–checker) ─────────
create table public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  currency text not null default 'KES' check (currency = 'KES'),
  total_minor bigint not null default 0 check (total_minor >= 0),
  line_count int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'processing', 'completed', 'partially_failed', 'failed', 'cancelled')),
  created_by uuid not null references auth.users on delete restrict,
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  provider_tracking_id text unique,
  provider_status text,
  failure_reason text,
  payroll_run_id uuid references public.payroll_runs on delete set null
);
create index on public.payout_batches (org_id, created_at desc);

create table public.payout_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid references auth.users on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (phone ~ '^254(7|1)[0-9]{8}$'),
  amount_minor bigint not null check (amount_minor between 1000 and 25000000),  -- KES 10 – 250,000 per M-Pesa transfer
  narrative text check (char_length(narrative) <= 100),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_ref text,
  failure_reason text
);
create index on public.payout_lines (batch_id);

alter table public.payout_batches enable row level security;
alter table public.payout_lines enable row level security;
-- Read: owners, directors and auditors of the workspace. Writes: server routes only (service role),
-- after role, MFA and two-person checks.
create policy payout_batches_read on public.payout_batches for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'director', 'auditor']));
create policy payout_lines_read on public.payout_lines for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'director', 'auditor']));
revoke insert, update, delete on public.payout_batches, public.payout_lines from authenticated, anon;

create trigger payout_batches_org_immutable before update on public.payout_batches
  for each row execute function public.prevent_org_change();
create trigger payout_lines_org_immutable before update on public.payout_lines
  for each row execute function public.prevent_org_change();

-- ───────── AI chief-of-staff ─────────
alter table public.organizations add column if not exists ai_enabled boolean not null default false;
-- Owner-only, through /api/settings (not client-writable): deliberately NOT added to the column grant.

create table public.ai_briefs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid references auth.users on delete set null,   -- requested by / delivered to
  kind text not null check (kind in ('weekly', 'checkins')),
  period_key text not null,                                -- e.g. 2026-W41 or 2026-10-09
  language text not null default 'en',
  content text not null,
  source text not null check (source in ('ai', 'rules')),
  model text
);
create unique index ai_briefs_once on public.ai_briefs (org_id, user_id, kind, period_key);
alter table public.ai_briefs enable row level security;
create policy ai_briefs_read on public.ai_briefs for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'director']) and (user_id is null or user_id = auth.uid() or kind = 'checkins'));
revoke insert, update, delete on public.ai_briefs from authenticated, anon;

-- ──────────────────────────── record as applied (Supabase CLI bookkeeping) ────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261008000001', 'schema'),
  ('20261008000002', 'rls'),
  ('20261008000003', 'functions'),
  ('20261008000004', 'storage'),
  ('20261008000005', 'activity'),
  ('20261008000006', 'currencies'),
  ('20261009000007', 'differentiators')
on conflict (version) do nothing;

commit;

-- Done. Check it worked with supabase/verify_setup.sql
