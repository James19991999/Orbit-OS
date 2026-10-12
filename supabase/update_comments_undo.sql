-- ════════════════════════════════════════════════════════════════════════════
-- OrbitOS — UPDATE (October 12, 2026): comments with @mentions on tasks, and Undo for deleted tasks.
-- For a project that already ran update_security.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.user_activity') is null then
    raise exception 'Run supabase/update_founder_console.sql and supabase/update_security.sql first — nothing was changed.';
  end if;
  if to_regclass('public.task_comments') is not null then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

-- ──────────────────────────── 20261012000012_ux.sql ────────────────────────────
-- Everyday usability (October 12, 2026): comments with @mentions on tasks, and undo for deleted tasks.

-- ───────── Task comments ─────────
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  author_id uuid references auth.users on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20)
);
create index on public.task_comments (task_id, created_at);
alter table public.task_comments enable row level security;
create trigger task_comments_org_immutable before update on public.task_comments for each row execute function public.prevent_org_change();

-- Anyone in the workspace can read; anyone who can write can comment (as themselves, on a task of the same workspace).
create policy task_comments_select on public.task_comments for select to authenticated
  using (public.is_org_member(org_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid()
    and public.can_write(org_id, array['owner','director','contributor'])
    and exists (select 1 from public.tasks t where t.id = task_id and t.org_id = task_comments.org_id));
-- Delete: your own comment, or any comment for owners and directors. No edits (keeps the record honest).
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.can_write(org_id, array['owner','director']));

-- Notifications: people @mentioned, plus the task's assignee and creator. Never the author; members of the workspace only.
create or replace function public.task_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
  who text;
  snippet text;
  u uuid;
begin
  if coalesce(current_setting('orbit.restoring', true), '') = 'on' then return null; end if;
  select id, org_id, title, assignee_id, created_by into t from public.tasks where id = new.task_id;
  if not found then return null; end if;
  select coalesce(nullif(full_name, ''), 'A teammate') into who from public.profiles where id = new.author_id;
  who := coalesce(who, 'A teammate');
  snippet := left(regexp_replace(new.body, '\s+', ' ', 'g'), 140);
  for u in
    select distinct m.user_id from public.memberships m
     where m.org_id = new.org_id and m.status = 'active' and m.user_id = any(new.mentions) and m.user_id is distinct from new.author_id
  loop
    perform public._notify(new.org_id, u, 'mention', who || ' mentioned you on “' || t.title || '”', snippet, '/operations/tasks/' || t.id || '#comments');
  end loop;
  for u in
    select distinct x from unnest(array[t.assignee_id, t.created_by]) x
     where x is not null and x is distinct from new.author_id and not (x = any(new.mentions))
       and exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = x and m.status = 'active')
  loop
    perform public._notify(new.org_id, u, 'task_comment', who || ' commented on “' || t.title || '”', snippet, '/operations/tasks/' || t.id || '#comments');
  end loop;
  return null;
end $$;
create trigger task_comments_notify after insert on public.task_comments for each row execute function public.task_comment_notify();

-- ───────── Undo for deleted tasks ─────────
-- delete_task() keeps a copy (task + comments) for 10 minutes so the person who deleted it can restore it exactly.
create table public.task_trash (
  task_id uuid primary key,
  org_id uuid not null references public.organizations on delete cascade,
  deleted_by uuid references auth.users on delete cascade,
  deleted_at timestamptz not null default now(),
  task jsonb not null,
  comments jsonb not null default '[]'
);
create index on public.task_trash (deleted_at);
alter table public.task_trash enable row level security;
revoke all on public.task_trash from authenticated, anon;

create or replace function public.delete_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not public.is_org_member(t.org_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  -- Same rule as deleting directly: owners and directors, or the contributor who created it.
  if not (public.can_write(t.org_id, array['owner','director'])
          or (t.created_by = auth.uid() and public.can_write(t.org_id, array['contributor']))) then
    raise exception 'Your role does not allow deleting this task' using errcode = '42501';
  end if;
  insert into public.task_trash (task_id, org_id, deleted_by, task, comments)
  values (t.id, t.org_id, auth.uid(), to_jsonb(t),
          coalesce((select jsonb_agg(c order by c.created_at) from public.task_comments c where c.task_id = t.id), '[]'))
  on conflict (task_id) do update set deleted_by = excluded.deleted_by, deleted_at = now(), task = excluded.task, comments = excluded.comments;
  delete from public.tasks where id = t.id;
end $$;

create or replace function public.restore_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  tr public.task_trash;
  t public.tasks;
begin
  select * into tr from public.task_trash
   where task_id = p_task and deleted_by = auth.uid() and deleted_at > now() - interval '10 minutes';
  if not found then
    raise exception 'This task can no longer be restored' using errcode = 'P0002';
  end if;
  if not public.can_write(tr.org_id, array['owner','director','contributor']) then
    raise exception 'This workspace is read-only' using errcode = '42501';
  end if;
  t := jsonb_populate_record(null::public.tasks, tr.task);
  -- Things that may have gone away in the meantime.
  if t.sprint_id is not null and not exists (select 1 from public.sprints where id = t.sprint_id) then t.sprint_id := null; end if;
  if t.assignee_id is not null and not exists (select 1 from auth.users where id = t.assignee_id) then t.assignee_id := null; end if;
  if t.created_by is not null and not exists (select 1 from auth.users where id = t.created_by) then t.created_by := null; end if;
  perform set_config('orbit.restoring', 'on', true);   -- no "new task" notifications or activity for a restore
  insert into public.tasks select (t).*;
  insert into public.task_comments
    select c.* from jsonb_populate_recordset(null::public.task_comments, tr.comments) c
     where c.author_id is null or exists (select 1 from auth.users u where u.id = c.author_id);
  perform set_config('orbit.restoring', 'off', true);
  delete from public.task_trash where task_id = p_task;
end $$;

revoke all on function public.delete_task(uuid), public.restore_task(uuid) from public, anon;
grant execute on function public.delete_task(uuid), public.restore_task(uuid) to authenticated;

-- Restores keep the original completion time and don't re-announce the task.
create or replace function public.task_before_write()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('orbit.restoring', true), '') = 'on' then return new; end if;
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

create or replace function public.task_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('orbit.restoring', true), '') = 'on' then return null; end if;
  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public._notify(new.org_id, new.assignee_id, 'task_assigned', 'New task assigned', new.title, '/operations/tasks/' || new.id);
  end if;
  return null;
end $$;

create or replace function public.activity_from_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('orbit.restoring', true), '') = 'on' then return null; end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    perform public._activity(new.org_id, coalesce(new.assignee_id, auth.uid()), 'task_done', 'Completed “' || new.title || '”',
      new.points || ' pts', '/operations/tasks/' || new.id);
  end if;
  return null;
end $$;

-- ──────────────────────────── record as applied (Supabase CLI bookkeeping) ────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261012000012', 'ux')
on conflict (version) do nothing;

commit;

-- Done. Check it worked with supabase/verify_setup.sql
