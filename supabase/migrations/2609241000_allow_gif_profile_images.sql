-- GIF profile images are allowed again; the client freezes them per the
-- user's performance mode (Settings > 그래픽). SVG stays blocked.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']::text[]
where id = 'avatars';

drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif')
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif')
  );

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif')
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif')
  );
