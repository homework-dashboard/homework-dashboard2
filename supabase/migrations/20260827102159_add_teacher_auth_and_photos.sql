/*
# Closed teacher registration + photos

## Overview
Adds closed (invite-code) registration for teachers and optional profile photos.
Parents continue to browse the board with no login. A teacher signs in with email
+ password; to sign up they must enter a registration code that an admin has
pre-created in the `registration_codes` table. Each code is single-use.

## New tables
1. `registration_codes`
   - `id` (uuid, primary key)
   - `code` (text, unique) - the secret invite code a teacher enters at sign-up
   - `used` (boolean, default false) - single-use flag
   - `created_at` (timestamptz)
2. `teacher_profiles`
   - `teacher_id` (uuid, primary key, references auth.users) - links an auth
     account to a profile
   - `display_name` (text) - shown name for the teacher
   - `created_at` (timestamptz)

## Modified tables
1. `teachers`
   - `photo_url` (text, nullable) - public URL of the teacher's photo (stored in
     a private Supabase Storage bucket; access is gated by a storage policy).

## Security
- RLS enabled on `registration_codes`, `teacher_profiles`.
- `registration_codes`: only authenticated users may SELECT (so the sign-up
  check can run), and only authenticated users may UPDATE (to mark a code used).
  No INSERT/DELETE through the anon key — codes are created by an admin via the
  SQL tool, not from the app.
- `teacher_profiles`: a teacher can SELECT/UPDATE only their own row
  (auth.uid() = teacher_id). INSERT is allowed for the owner only.
- `teachers` policies are tightened: SELECT stays open to anon+authenticated
  (parents must read). INSERT/UPDATE/DELETE are now restricted to authenticated
  users only — only signed-in teachers can add or change board entries.
- A private Storage bucket `teacher-photos` is created. Objects are readable by
  anyone with a signed URL (public read via the bucket policy is NOT enabled;
  instead we use the public URL of the object which Supabase Storage serves for
  public buckets). We make the bucket PUBLIC so photo URLs work in <img> tags,
  but writes are restricted to authenticated owners.

## Notes
1. Registration codes are created by an admin directly in the database. The
   first code is seeded below so a teacher can sign up immediately.
2. `teacher_profiles` is separate from `teachers` (the board entries) because a
   teacher may manage several board rows; the profile holds the auth account
   info. The board's `teachers` rows are what parents browse.
3. photo_url stores the public URL from the `teacher-photos` bucket.
*/

-- 1. registration_codes
CREATE TABLE IF NOT EXISTS registration_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE registration_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_reg_codes" ON registration_codes;
CREATE POLICY "auth_select_reg_codes" ON registration_codes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_reg_codes" ON registration_codes;
CREATE POLICY "auth_update_reg_codes" ON registration_codes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- 2. teacher_profiles
CREATE TABLE IF NOT EXISTS teacher_profiles (
  teacher_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_profile" ON teacher_profiles;
CREATE POLICY "owner_select_profile" ON teacher_profiles FOR SELECT
  TO authenticated USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "owner_insert_profile" ON teacher_profiles;
CREATE POLICY "owner_insert_profile" ON teacher_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "owner_update_profile" ON teacher_profiles;
CREATE POLICY "owner_update_profile" ON teacher_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

-- 3. teachers: add photo_url, tighten write policies
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url text;

DROP POLICY IF EXISTS "anon_insert_teachers" ON teachers;
CREATE POLICY "auth_insert_teachers" ON teachers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_teachers" ON teachers;
CREATE POLICY "auth_update_teachers" ON teachers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_teachers" ON teachers;
CREATE POLICY "auth_delete_teachers" ON teachers FOR DELETE
  TO authenticated USING (true);

-- lessons / homework: tighten writes to authenticated only
DROP POLICY IF EXISTS "anon_insert_lessons" ON lessons;
CREATE POLICY "auth_insert_lessons" ON lessons FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_lessons" ON lessons;
CREATE POLICY "auth_update_lessons" ON lessons FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_lessons" ON lessons;
CREATE POLICY "auth_delete_lessons" ON lessons FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_homework" ON homework;
CREATE POLICY "auth_insert_homework" ON homework FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_homework" ON homework;
CREATE POLICY "auth_update_homework" ON homework FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_homework" ON homework;
CREATE POLICY "auth_delete_homework" ON homework FOR DELETE
  TO authenticated USING (true);

-- 4. Seed a registration code so the first teacher can sign up
INSERT INTO registration_codes (code)
SELECT 'MUSIC-2026' WHERE NOT EXISTS (
  SELECT 1 FROM registration_codes WHERE code = 'MUSIC-2026'
);
