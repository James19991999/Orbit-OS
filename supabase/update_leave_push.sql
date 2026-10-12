-- ════════════════════════════════════════════════════════════════════════════
-- OrbitOS — UPDATE (October 12, 2026): leave and time off, phone notifications, and job title/department on imported invites.
-- For a project that already ran update_comments_undo.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.task_comments') is null then
    raise exception 'Run supabase/update_comments_undo.sql first, then this file — nothing was changed.';
  end if;
  if to_regclass('public.leave_requests') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

-- ──────────────────────────── 20261012000013_work.sql ────────────────────────────
-- Leave and time off, and phone push notifications (October 12, 2026).

-- ───────── Leave ─────────
-- Working days (Monday–Friday) between two dates, inclusive. Public holidays are not subtracted.
create or replace function public.weekdays_between(p_from date, p_to date)
returns int language sql immutable as $$
  select count(*)::int from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d where extract(isodow from d) < 6
$$;

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind text not null default 'annual' check (kind in ('annual', 'sick', 'maternity', 'paternity', 'compassionate', 'study', 'unpaid', 'other')),
  starts_on date not null,
  ends_on date not null,
  days int generated always as (public.weekdays_between(starts_on, ends_on)) stored,
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  check (ends_on >= starts_on and ends_on - starts_on <= 180)
);
create index on public.leave_requests (org_id, status, starts_on);
create index on public.leave_requests (user_id, starts_on);
alter table public.leave_requests enable row level security;
create trigger leave_requests_org_immutable before update on public.leave_requests for each row execute function public.prevent_org_change();

-- The type of leave and the note are private: only the person and the workspace's owners and directors see them.
-- Teammates only learn that someone is away, through team_away().
create policy leave_select on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.has_org_role(org_id, array['owner','director']));
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_by is null and decided_at is null and decision_note is null
    and public.can_write(org_id, array['owner','director','contributor']));
-- No direct updates or deletes: decisions and cancellations go through the functions below.
revoke update, delete on public.leave_requests from authenticated, anon;

-- No double booking, and notify the people who can approve.
create or replace function public.leave_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.leave_requests r
              where r.user_id = new.user_id and r.org_id = new.org_id and r.status in ('pending', 'approved')
                and r.starts_on <= new.ends_on and r.ends_on >= new.starts_on) then
    raise exception 'You already have time off requested for some of these days' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger leave_before_insert before insert on public.leave_requests for each row execute function public.leave_before_insert();

create or replace function public.leave_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  u uuid;
begin
  select coalesce(nullif(full_name, ''), 'A teammate') into who from public.profiles where id = new.user_id;
  for u in select m.user_id from public.memberships m
            where m.org_id = new.org_id and m.status = 'active' and m.role in ('owner', 'director') and m.user_id <> new.user_id
  loop
    perform public._notify(new.org_id, u, 'leave_request', coalesce(who, 'A teammate') || ' requested time off',
      new.starts_on || ' to ' || new.ends_on || ' · ' || new.days || ' days', '/people?tab=leave');
  end loop;
  return null;
end $$;
create trigger leave_after_insert after insert on public.leave_requests for each row execute function public.leave_after_insert();

-- Approve or decline. Nobody decides their own request, except an owner with no other owner or director to ask.
create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or not public.has_org_role(r.org_id, array['owner','director']) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if not public.can_write(r.org_id, array['owner','director']) then
    raise exception 'This workspace is read-only' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request has already been decided' using errcode = '55000';
  end if;
  if r.user_id = auth.uid() and (not public.has_org_role(r.org_id, array['owner'])
      or exists (select 1 from public.memberships m where m.org_id = r.org_id and m.status = 'active'
                  and m.role in ('owner', 'director') and m.user_id <> auth.uid())) then
    raise exception 'Someone else needs to approve your own time off' using errcode = '42501';
  end if;
  update public.leave_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where id = p_id;
  perform public._notify(r.org_id, r.user_id, 'leave_decided',
    case when p_approve then 'Time off approved' else 'Time off declined' end,
    r.starts_on || ' to ' || r.ends_on || ' · ' || r.days || ' days', '/people?tab=leave');
end $$;

-- Cancel your own request, as long as it hasn't ended.
create or replace function public.cancel_leave(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if r.status not in ('pending', 'approved') or r.ends_on < current_date then
    raise exception 'This request can no longer be cancelled' using errcode = '55000';
  end if;
  update public.leave_requests set status = 'cancelled' where id = p_id;
end $$;

-- Who is away (approved leave only, dates only — never the type or note). Any member of the workspace.
create or replace function public.team_away(p_org uuid, p_from date, p_to date)
returns table (user_id uuid, starts_on date, ends_on date)
language sql stable security definer set search_path = public as $$
  select r.user_id, r.starts_on, r.ends_on from public.leave_requests r
   where public.is_org_member(p_org) and r.org_id = p_org and r.status = 'approved'
     and r.starts_on <= p_to and r.ends_on >= p_from and p_to - p_from <= 400
   order by r.starts_on
$$;

revoke all on function public.decide_leave(uuid, boolean, text), public.cancel_leave(uuid), public.team_away(uuid, date, date) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text), public.cancel_leave(uuid), public.team_away(uuid, date, date) to authenticated;

-- Yearly allowance of annual leave (Kenya's Employment Act sets at least 21 working days).
create table public.leave_settings (
  org_id uuid primary key references public.organizations on delete cascade,
  annual_days int not null default 21 check (annual_days between 0 and 60),
  updated_at timestamptz not null default now()
);
alter table public.leave_settings enable row level security;
create policy leave_settings_select on public.leave_settings for select to authenticated using (public.is_org_member(org_id));
create policy leave_settings_insert on public.leave_settings for insert to authenticated with check (public.can_write(org_id, array['owner','director']));
create policy leave_settings_update on public.leave_settings for update to authenticated
  using (public.can_write(org_id, array['owner','director'])) with check (public.can_write(org_id, array['owner','director']));

-- ───────── Phone push notifications ─────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  last_success_at timestamptz,
  failures int not null default 0
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke update on public.push_subscriptions from authenticated, anon;

alter table public.notifications add column if not exists pushed_at timestamptz;

-- ───────── Imports: an invite can carry the person's job title and department ─────────
alter table public.invites add column if not exists title text check (char_length(title) <= 100);
alter table public.invites add column if not exists department text check (char_length(department) <= 100);

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
  insert into public.memberships (org_id, user_id, role, title, department) values (v_org.id, auth.uid(), v_inv.role, v_inv.title, v_inv.department)
  on conflict (org_id, user_id) do update set role = excluded.role, status = 'active',
    title = coalesce(excluded.title, public.memberships.title), department = coalesce(excluded.department, public.memberships.department);
  update public.invites set accepted_at = now() where id = v_inv.id;
  return v_org.id;
end $$;

-- ──────────────────────────── record as applied (Supabase CLI bookkeeping) ────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261012000013', 'work')
on conflict (version) do nothing;

commit;

-- Done. Check it worked with supabase/verify_setup.sql
