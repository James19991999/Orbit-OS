-- Google Calendar / Outlook sync: each person connects their own calendar.
--   • OrbitOS meetings they're invited to are written into that calendar (and updated / removed with the meeting).
--   • Their busy times (start and end only — never titles) are read back, so the slot finder avoids them.
-- Tokens are AES-256-GCM encrypted by the server and never readable by clients.

create table public.calendar_connections (
  user_id uuid primary key references auth.users on delete cascade,   -- one calendar per person
  provider text not null check (provider in ('google', 'microsoft')),
  account_email text not null,
  refresh_token_enc text not null,
  access_token_enc text,
  access_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'error')),
  last_error text,
  connected_at timestamptz not null default now(),
  busy_synced_at timestamptz
);
alter table public.calendar_connections enable row level security;
create policy calendar_connections_own on public.calendar_connections for select to authenticated using (user_id = auth.uid());
revoke all on public.calendar_connections from authenticated, anon;
grant select (user_id, provider, account_email, status, last_error, connected_at, busy_synced_at) on public.calendar_connections to authenticated;

-- Busy blocks for the next two weeks. Teammates in a shared workspace may read them (times only).
create table public.calendar_busy (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at)
);
create index on public.calendar_busy (user_id, starts_at);
alter table public.calendar_busy enable row level security;
create policy calendar_busy_teammates on public.calendar_busy for select to authenticated
  using (user_id = auth.uid() or public.shares_org_with(user_id));
revoke insert, update, delete on public.calendar_busy from authenticated, anon;

-- Which event in whose calendar belongs to which OrbitOS meeting.
create table public.calendar_event_links (
  meeting_id uuid not null references public.meetings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  external_id text not null,
  synced_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
alter table public.calendar_event_links enable row level security;
revoke all on public.calendar_event_links from authenticated, anon;

-- A cancelled meeting must leave people's calendars too, so it goes through /api/meetings/[id] (server),
-- which removes the events first. Organizers keep a direct delete only when nobody's calendar is linked.
create or replace function public.meetings_calendar_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from public.calendar_event_links l where l.meeting_id = old.id) then
    raise exception 'This meeting is in people''s calendars. Cancel it with the Cancel meeting button so their calendars are updated.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger meetings_calendar_delete_guard before delete on public.meetings for each row execute function public.meetings_calendar_delete_guard();
