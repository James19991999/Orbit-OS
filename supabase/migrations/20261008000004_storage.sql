-- Storage buckets. Object paths are always "<org_id>/..." (avatars: "<user_id>/...").
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('evidence', 'evidence', false),
  ('vault', 'vault', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "avatars read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "evidence read members" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.is_org_member(public.try_uuid((storage.foldername(name))[1])));
create policy "evidence write managers" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "evidence delete managers" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));

-- Vault requires an MFA-verified session (AAL2).
create policy "vault read managers" on storage.objects for select to authenticated
  using (bucket_id = 'vault' and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "vault write managers" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
create policy "vault delete managers" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and public.can_write(public.try_uuid((storage.foldername(name))[1]), array['owner','director']));
-- 'exports' has no client policies: only the service role writes and signs URLs.
