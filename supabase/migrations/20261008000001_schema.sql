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
