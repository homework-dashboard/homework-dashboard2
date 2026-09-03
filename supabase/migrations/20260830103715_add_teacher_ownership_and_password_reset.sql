/*
# Teacher ownership, password reset, and scoped editing

## Overview
This migration introduces per-teacher ownership so a logged-in teacher can
only edit their own board section (their teacher row, lessons, and homework).
Admins retain full access to everything. It also adds the database-side
support for password reset: an admin can reset any user's password, and
users can request a password recovery email.

## Changes

### 1. New column: `teachers.owner_id`
- `owner_id` (uuid, nullable, references auth.users)
- Links a board "teacher" row to the auth account that owns it.
- Nullable so existing rows remain valid; new rows created by a teacher
  get their auth.uid() as owner_id.
- Admins can create teacher rows without an owner (or assign one).

### 2. RLS policy changes on `teachers`
- SELECT: stays open to anon + authenticated (parents browse).
- INSERT: authenticated only. If the caller is NOT an admin, they can
  only insert a row where owner_id = auth.uid() (their own section).
  Admins can insert any row.
- UPDATE: authenticated only. Non-admins can only update rows they own.
  Admins can update any row.
- DELETE: authenticated only. Non-admins can only delete rows they own.
  Admins can delete any row.

### 3. RLS policy changes on `lessons`
- SELECT: stays open to anon + authenticated.
- INSERT/UPDATE/DELETE: authenticated only. Non-admins can only modify
  lessons belonging to a teacher row they own. Admins can modify any.

### 4. RLS policy changes on `homework`
- SELECT: stays open to anon + authenticated.
- INSERT/UPDATE/DELETE: authenticated only. Non-admins can only modify
  homework belonging to a lesson whose teacher they own. Admins can modify any.

### 5. New function: `admin_reset_user_password(p_user_id uuid)`
- SECURITY DEFINER. Admin-only.
- Generates a random 12-char temporary password.
- Updates the user's password in auth.users via auth.admin.updateUser.
- Returns the temporary password so the admin can pass it to the teacher.

### 6. New function: `get_my_teacher_profile()`
- Returns the teacher_profiles row for the current user.
- Used by the personal cabinet to know which teacher section to show.

### 7. New function: `get_my_teacher_id()`
- Returns the teachers.id for the current user's owned teacher row.
- Used to scope lessons/homework queries.

## Security
- owner_id column is set by the database or by admin functions, never
  directly user-editable (no GRANT on the column beyond what INSERT allows,
  and INSERT policy enforces owner_id = auth.uid() for non-admins).
- Password reset function checks admin status before proceeding.
- All SECURITY DEFINER functions have search_path = public.
*/

-- 1. Add owner_id to teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS teachers_owner_id_idx ON teachers(owner_id);

-- 2. Recreate teachers policies with ownership checks
-- Helper: admin check via EXISTS subquery
DROP POLICY IF EXISTS "anon_select_teachers" ON teachers;
DROP POLICY IF EXISTS "auth_select_teachers" ON teachers;
CREATE POLICY "select_teachers" ON teachers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_teachers" ON teachers;
CREATE POLICY "insert_teachers" ON teachers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "auth_update_teachers" ON teachers;
CREATE POLICY "update_teachers" ON teachers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR owner_id = auth.uid()
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "auth_delete_teachers" ON teachers;
CREATE POLICY "delete_teachers" ON teachers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR owner_id = auth.uid()
  );

-- 3. Recreate lessons policies with ownership checks
DROP POLICY IF EXISTS "anon_select_lessons" ON lessons;
DROP POLICY IF EXISTS "auth_select_lessons" ON lessons;
CREATE POLICY "select_lessons" ON lessons FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_lessons" ON lessons;
CREATE POLICY "insert_lessons" ON lessons FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = lessons.teacher_id AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "auth_update_lessons" ON lessons;
CREATE POLICY "update_lessons" ON lessons FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = lessons.teacher_id AND t.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = lessons.teacher_id AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "auth_delete_lessons" ON lessons;
CREATE POLICY "delete_lessons" ON lessons FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = lessons.teacher_id AND t.owner_id = auth.uid()
    )
  );

-- 4. Recreate homework policies with ownership checks
DROP POLICY IF EXISTS "anon_select_homework" ON homework;
DROP POLICY IF EXISTS "auth_select_homework" ON homework;
CREATE POLICY "select_homework" ON homework FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_homework" ON homework;
CREATE POLICY "insert_homework" ON homework FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN teachers t ON t.id = l.teacher_id
      WHERE l.id = homework.lesson_id AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "auth_update_homework" ON homework;
CREATE POLICY "update_homework" ON homework FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN teachers t ON t.id = l.teacher_id
      WHERE l.id = homework.lesson_id AND t.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN teachers t ON t.id = l.teacher_id
      WHERE l.id = homework.lesson_id AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "auth_delete_homework" ON homework;
CREATE POLICY "delete_homework" ON homework FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN teachers t ON t.id = l.teacher_id
      WHERE l.id = homework.lesson_id AND t.owner_id = auth.uid()
    )
  );

-- 5. get_my_teacher_profile function
CREATE OR REPLACE FUNCTION get_my_teacher_profile()
RETURNS TABLE (teacher_id uuid, display_name text, is_admin boolean)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT tp.teacher_id, tp.display_name, tp.is_admin
    FROM teacher_profiles tp
    WHERE tp.teacher_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_teacher_profile() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_teacher_profile() TO authenticated;

-- 6. get_my_teacher_id function (returns the teachers.id the current user owns)
CREATE OR REPLACE FUNCTION get_my_teacher_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT t.id INTO v_id FROM teachers t WHERE t.owner_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_teacher_id() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_teacher_id() TO authenticated;

-- 7. admin_reset_user_password function
-- Generates a temporary password and sets it on the target user's auth account.
-- The admin sees the temp password and passes it to the teacher.
CREATE OR REPLACE FUNCTION admin_reset_user_password(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_temp_password text;
  v_is_admin boolean;
BEGIN
  -- Check caller is admin
  SELECT tp.is_admin INTO v_is_admin FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Generate a random 12-char alphanumeric password
  v_temp_password := upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 12));

  -- Update the user's password using the auth admin API
  PERFORM auth.admin.update_user(
    p_user_id,
    '{"password": "' || v_temp_password || '"}'::jsonb
  );

  RETURN v_temp_password;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_reset_user_password(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_reset_user_password(uuid) TO authenticated;
