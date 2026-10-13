-- Growth automations for the founder: trial follow-up emails, lapsed and failed payment follow-up, at-risk customer
-- alerts, the weekly founder email, and the in-app help centre with AI answers.

-- People can turn off tips and follow-up emails (payment problems are still sent: they are about their account).
alter table public.profiles add column if not exists product_emails boolean not null default true;
grant update (product_emails) on public.profiles to authenticated;

-- What was sent, so every email goes out exactly once. Server only.
create table public.lifecycle_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid references public.organizations on delete cascade,
  kind text not null check (kind in ('trial', 'billing', 'founder_weekly')),
  ref text not null check (char_length(ref) <= 80),
  step text not null check (char_length(step) <= 60),
  detail jsonb not null default '{}',
  unique (kind, ref, step)
);
create index on public.lifecycle_log (created_at desc);
alter table public.lifecycle_log enable row level security;
revoke all on public.lifecycle_log from anon, authenticated;

-- Questions asked in the help centre: shows the founder what customers struggle with. Server only, kept 180 days.
create table public.help_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid references public.organizations on delete cascade,
  user_id uuid references auth.users on delete set null,
  language text not null default 'en',
  question text not null check (char_length(question) between 3 and 500),
  answered boolean not null default false,
  sources text[] not null default '{}'
);
create index on public.help_questions (created_at desc);
alter table public.help_questions enable row level security;
revoke all on public.help_questions from anon, authenticated;

-- Customers worth a call: gone quiet, trial without a team, lapsed, or a failed payment not yet fixed.
create or replace function public.platform_at_risk()
returns table (id uuid, name text, slug text, plan text, plan_period text, plan_expires_at timestamptz, created_at timestamptz,
               members bigint, last_active timestamptz, reason text, owner_name text, owner_email text)
language sql stable security definer set search_path = public as $$
  with o as (
    select o.*, (select count(*) from public.memberships m where m.org_id = o.id and m.status = 'active') as members,
           (select max(a.last_seen_at) from public.user_activity a join public.memberships m
              on m.user_id = a.user_id and m.org_id = o.id and m.status = 'active') as last_active
      from public.organizations o where o.status = 'active'
  ), r as (
    select o.*, case
      when exists (select 1 from public.billing_payments p where p.org_id = o.id and p.state = 'FAILED' and p.created_at > now() - interval '7 days')
           and not exists (select 1 from public.billing_payments p where p.org_id = o.id and p.state = 'COMPLETE' and p.created_at > now() - interval '7 days')
        then 'payment_failed'
      when o.plan_expires_at < now() and o.plan_expires_at > now() - interval '30 days' then 'lapsed'
      when o.plan_expires_at > now() and coalesce(o.last_active, o.created_at) < now() - interval '7 days' then 'quiet'
      when o.plan_period = 'trial' and o.plan_expires_at > now() and o.members <= 1 and o.created_at < now() - interval '3 days' then 'no_team'
    end as reason from o
  )
  select r.id, r.name, r.slug, r.plan, r.plan_period, r.plan_expires_at, r.created_at, r.members, r.last_active, r.reason,
         p.full_name, u.email
    from r join auth.users u on u.id = r.owner_id left join public.profiles p on p.id = r.owner_id
   where r.reason is not null
   order by case r.reason when 'payment_failed' then 0 when 'lapsed' then 1 when 'quiet' then 2 else 3 end, r.plan_expires_at
   limit 100
$$;
revoke all on function public.platform_at_risk() from public, anon, authenticated;
grant execute on function public.platform_at_risk() to service_role;
