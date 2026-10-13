-- Automations: new-member onboarding, invoice reminders, overdue nudges with escalation, and time-off handover.

-- ───────── Per-workspace switches (managers change them; everyone in the workspace can see them) ─────────
create table public.automation_settings (
  org_id uuid primary key references public.organizations on delete cascade,
  onboarding boolean not null default true,
  invoice_reminders boolean not null default false,          -- emails people outside the company, so it starts off
  overdue_nudges boolean not null default true,
  nudge_after_days int not null default 2 check (nudge_after_days between 1 and 14),
  escalate_after_days int not null default 5 check (escalate_after_days between 2 and 30),
  leave_handover boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null default auth.uid(),
  check (escalate_after_days > nudge_after_days)
);
alter table public.automation_settings enable row level security;
create policy automation_settings_select on public.automation_settings for select to authenticated using (public.is_org_member(org_id));
create policy automation_settings_insert on public.automation_settings for insert to authenticated
  with check (public.can_write(org_id, array['owner','director']));
create policy automation_settings_update on public.automation_settings for update to authenticated
  using (public.can_write(org_id, array['owner','director'])) with check (public.can_write(org_id, array['owner','director']));
revoke all on public.automation_settings from anon;
grant select, insert, update on public.automation_settings to authenticated;

create or replace function public.automation_settings_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger automation_settings_touch before insert or update on public.automation_settings
  for each row execute function public.automation_settings_touch();

-- ───────── What each automation did (also how each step is done exactly once) ─────────
create table public.automation_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  kind text not null check (kind in ('onboarding', 'invoice_reminder', 'overdue_nudge', 'overdue_escalation', 'leave_handover')),
  ref_id uuid not null,                      -- the member, invoice, task or leave request it acted on
  step text not null check (char_length(step) <= 60),
  detail jsonb not null default '{}',
  unique (kind, ref_id, step)
);
create index on public.automation_log (org_id, created_at desc);
alter table public.automation_log enable row level security;
-- Managers can read their workspace's log; only the server writes it.
create policy automation_log_select on public.automation_log for select to authenticated
  using (public.has_org_role(org_id, array['owner','director']));
revoke all on public.automation_log from anon, authenticated;
grant select on public.automation_log to authenticated;

-- ───────── Bulk task changes from automations: one summary notification instead of one per task ─────────
create or replace function public.task_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('orbit.restoring', true), '') = 'on' then return null; end if;
  if coalesce(current_setting('orbit.quiet_assign', true), '') = 'on' then return null; end if;
  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public._notify(new.org_id, new.assignee_id, 'task_assigned', 'New task assigned', new.title, '/operations/tasks/' || new.id);
  end if;
  return null;
end $$;

-- Server only: insert a list of tasks (an automation's checklist) without a notification per task.
create or replace function public.automation_insert_tasks(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform set_config('orbit.quiet_assign', 'on', true);
  insert into public.tasks (org_id, title, status, priority, points, tags, due_on, assignee_id, created_by)
  select r.org_id, left(r.title, 200), 'todo', r.priority, r.points, coalesce(r.tags, '{}'), r.due_on, r.assignee_id, r.created_by
    from jsonb_to_recordset(p_rows) as r(org_id uuid, title text, priority text, points int, tags text[], due_on date, assignee_id uuid, created_by uuid);
  get diagnostics v_n = row_count;
  perform set_config('orbit.quiet_assign', 'off', true);
  return v_n;
end $$;
revoke all on function public.automation_insert_tasks(jsonb) from public, anon, authenticated;
grant execute on function public.automation_insert_tasks(jsonb) to service_role;

-- ───────── Time off: who covers while you're away ─────────
alter table public.leave_requests add column if not exists cover_id uuid references auth.users on delete set null;

-- The person on leave or a manager picks a teammate to cover, and can move the tasks due while they're away.
create or replace function public.set_leave_cover(p_id uuid, p_cover uuid, p_reassign boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare r public.leave_requests; v_moved int := 0; v_name text;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or not (r.user_id = auth.uid() or public.has_org_role(r.org_id, array['owner','director'])) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if not public.org_is_writable(r.org_id) then raise exception 'This workspace is read-only' using errcode = '42501'; end if;
  if r.status not in ('pending', 'approved') or r.ends_on < current_date then
    raise exception 'This time off has ended or was cancelled' using errcode = '55000';
  end if;
  if p_cover is not null then
    if p_cover = r.user_id then raise exception 'Pick someone else to cover' using errcode = '22023'; end if;
    if not exists (select 1 from public.memberships m where m.org_id = r.org_id and m.user_id = p_cover
                    and m.status = 'active' and m.role in ('owner', 'director', 'contributor')) then
      raise exception 'That person is not in this workspace' using errcode = '22023';
    end if;
  end if;
  update public.leave_requests set cover_id = p_cover where id = p_id;
  if p_cover is not null and p_reassign then
    perform set_config('orbit.quiet_assign', 'on', true);
    update public.tasks set assignee_id = p_cover
     where org_id = r.org_id and assignee_id = r.user_id and status <> 'done'
       and due_on between r.starts_on and r.ends_on;
    get diagnostics v_moved = row_count;
    perform set_config('orbit.quiet_assign', 'off', true);
  end if;
  if p_cover is not null and p_cover <> auth.uid() then
    select full_name into v_name from public.profiles where id = r.user_id;
    perform public._notify(r.org_id, p_cover, 'leave_cover',
      coalesce(nullif(v_name, ''), 'A teammate') || ' asked you to cover',
      r.starts_on || ' to ' || r.ends_on || ' · ' || v_moved || ' tasks', '/my-day');
  end if;
  perform public._audit(r.org_id, 'leave.cover_set', 'leave_request', r.id::text,
    jsonb_build_object('cover', p_cover, 'moved', v_moved));
  return v_moved;
end $$;
revoke all on function public.set_leave_cover(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_leave_cover(uuid, uuid, boolean) to authenticated;

-- Who's away now also says who is covering (type and note stay private, as before).
drop function if exists public.team_away(uuid, date, date);
create function public.team_away(p_org uuid, p_from date, p_to date)
returns table (user_id uuid, starts_on date, ends_on date, cover_id uuid)
language sql stable security definer set search_path = public as $$
  select r.user_id, r.starts_on, r.ends_on, r.cover_id from public.leave_requests r
   where public.is_org_member(p_org) and r.org_id = p_org and r.status = 'approved'
     and r.starts_on <= p_to and r.ends_on >= p_from and p_to - p_from <= 400
   order by r.starts_on
$$;
revoke all on function public.team_away(uuid, date, date) from public, anon;
grant execute on function public.team_away(uuid, date, date) to authenticated;
