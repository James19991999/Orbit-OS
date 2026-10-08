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
