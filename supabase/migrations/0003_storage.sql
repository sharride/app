-- =============================================================================
-- sharride — 0003_storage.sql
--
-- Closes the one remaining "SCHEMA ASSUMPTION" comment in apiService.ts:
-- uploadAvatar() assumes a public bucket named `avatars` exists. It didn't,
-- anywhere in either zip. This creates it and scopes writes to each user's
-- own folder (path is `${userId}/avatar-*.ext`, matching uploadAvatar()'s
-- existing path construction exactly — no client change needed).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy p_avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');

create policy p_avatars_owner_write on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy p_avatars_owner_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy p_avatars_owner_delete on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
