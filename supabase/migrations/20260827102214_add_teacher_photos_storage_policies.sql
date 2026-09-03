/*
# Storage policies for teacher-photos bucket

## Overview
Sets RLS policies on the `teacher-photos` storage bucket so:
- Anyone (anon + authenticated) can READ photos — parents need to see them in <img> tags.
- Only authenticated users can UPLOAD photos — only signed-in teachers.
- Only authenticated users can UPDATE/DELETE their own uploads.

## Security
- SELECT (read): public (anon, authenticated) — photos are displayed to parents.
- INSERT (upload): authenticated only.
- UPDATE: authenticated, owner only (path starts with their user id).
- DELETE: authenticated, owner only.
*/

DROP POLICY IF EXISTS "public_read_photos" ON storage.objects;
CREATE POLICY "public_read_photos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'teacher-photos');

DROP POLICY IF EXISTS "auth_upload_photos" ON storage.objects;
CREATE POLICY "auth_upload_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'teacher-photos');

DROP POLICY IF EXISTS "auth_update_photos" ON storage.objects;
CREATE POLICY "auth_update_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'teacher-photos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'teacher-photos');

DROP POLICY IF EXISTS "auth_delete_photos" ON storage.objects;
CREATE POLICY "auth_delete_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'teacher-photos' AND owner = auth.uid());
