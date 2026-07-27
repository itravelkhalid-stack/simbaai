-- Allow authenticated org members to upload/update/delete under their org prefix.
-- Path layout: {organization_id}/{brand_id}/{filename}
-- Service role continues to work (bypasses RLS) for publish signed URLs + jobs.

drop policy if exists brand_media_insert on storage.objects;
drop policy if exists brand_media_update on storage.objects;
drop policy if exists brand_media_delete on storage.objects;

create policy brand_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy brand_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brand-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  )
  with check (
    bucket_id = 'brand-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy brand_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brand-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );
