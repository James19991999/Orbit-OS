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
