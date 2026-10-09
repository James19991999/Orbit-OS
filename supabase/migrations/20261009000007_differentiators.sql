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
