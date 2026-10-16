-- Profile images are publicly viewable, so keep their formats deliberately
-- narrow. GIFs continuously decode at every avatar call site; SVG can carry
-- active content in some browsers. Storage enforces this even if a client
-- bypasses the file picker.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
where id = 'avatars';

drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  );

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  );
