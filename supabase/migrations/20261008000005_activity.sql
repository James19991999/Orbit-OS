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
