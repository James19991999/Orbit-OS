-- ════════════════════════════════════════════════════════════════════════════
-- OrbitOS — UPDATE (October 12, 2026): product tour, and workspace branding (logo and accent colour).
-- For a project that already ran update_leave_push.sql. Paste this whole file into Supabase → SQL Editor →
-- New query, and click Run once. One transaction: if anything fails, nothing changes. Safe to run only once.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'OrbitOS is not set up in this project yet. Run supabase/setup_all.sql instead — nothing was changed.';
  end if;
  if to_regclass('public.leave_requests') is null then
    raise exception 'Run supabase/update_leave_push.sql first, then this file — nothing was changed.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'tour_done_at') then
    raise exception 'This update has already been applied — nothing was changed.';
  end if;
end $guard$;

-- ──────────────────────────── 20261012000014_polish.sql ────────────────────────────
-- Product tour and workspace branding (October 12, 2026).

-- The guided tour runs once per person; this remembers that they finished or skipped it.
alter table public.profiles add column if not exists tour_done_at timestamptz;
grant update (tour_done_at) on public.profiles to authenticated;

-- Workspace branding: an accent colour and a logo. Owners change them through the server (/api/settings/branding).
alter table public.organizations add column if not exists brand_color text check (brand_color ~ '^#[0-9a-f]{6}$');
alter table public.organizations add column if not exists brand_logo_path text
  check (char_length(brand_logo_path) <= 120 and brand_logo_path ~ '^[0-9a-f-]{36}/logo-[0-9]{10,16}\.(png|jpg|webp)$');

-- Logos are public images (shown before anyone signs in on a workspace's own sign-in page), 1 MB, no SVG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "branding read" on storage.objects;
drop policy if exists "branding write owners" on storage.objects;
drop policy if exists "branding delete owners" on storage.objects;
create policy "branding read" on storage.objects for select using (bucket_id = 'branding');
create policy "branding write owners" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner']));
create policy "branding delete owners" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner']));

-- ──────────────────────────── record as applied (Supabase CLI bookkeeping) ────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261012000014', 'polish')
on conflict (version) do nothing;

commit;

-- Done. Check it worked with supabase/verify_setup.sql
