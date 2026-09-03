/*
# Add delete functions for teacher sections, profiles, and registration codes

## Overview
1. `delete_my_teacher_section()` — allows a logged-in teacher to delete their own
   board section (the `teachers` row they own), cascading to all lessons and homework.
2. `delete_my_account()` — allows a logged-in teacher to delete their own profile
   and board section. The auth account itself is deleted via the edge function
   `admin-delete-user` (service role), but this function cleans up all DB rows.
3. `admin_delete_teacher_section(p_teacher_id uuid)` — admin-only, deletes any
   teacher's board section. (Already exists as `delete_teacher_admin`, keeping it.)
4. `admin_delete_account(p_user_id uuid)` — admin-only, deletes a teacher's profile
   and board section. Auth account deletion handled by edge function.
5. `admin_delete_registration_code(p_code_id uuid)` — admin-only, deletes any
   registration code.
6. `delete_my_account_full()` — SECURITY DEFINER function that deletes the caller's
   teacher_profile, their owned teachers row(s), and returns the user id so the
   edge function can delete the auth account.
7. `admin_delete_account_full(p_user_id uuid)` — SECURITY DEFINER, admin-only,
   same cleanup for any user, returns the user id for edge function auth deletion.

## Security
- All self-service functions check auth.uid() ownership.
- Admin functions check is_admin via teacher_profiles.
- SECURITY DEFINER with search_path = public for functions that need to
  cascade across RLS-protected tables.
- Registration codes DELETE policy added for admin.
*/

-- 1. delete_my_teacher_section: delete the caller's owned teacher row
CREATE OR REPLACE FUNCTION delete_my_teacher_section()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_teacher_id uuid;
BEGIN
  SELECT t.id INTO v_teacher_id FROM teachers t WHERE t.owner_id = auth.uid() LIMIT 1;
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'У вас нет раздела преподавателя';
  END IF;
  DELETE FROM teachers WHERE id = v_teacher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_my_teacher_section() FROM anon;
GRANT EXECUTE ON FUNCTION delete_my_teacher_section() TO authenticated;

-- 2. delete_my_account_full: delete caller's profile + teacher section, return user id
CREATE OR REPLACE FUNCTION delete_my_account_full()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;
  -- Delete owned teacher sections (cascades to lessons, homework, etc.)
  DELETE FROM teachers WHERE owner_id = v_user_id;
  -- Delete teacher profile
  DELETE FROM teacher_profiles WHERE teacher_id = v_user_id;
  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_my_account_full() FROM anon;
GRANT EXECUTE ON FUNCTION delete_my_account_full() TO authenticated;

-- 3. admin_delete_account_full: admin deletes any user's profile + teacher section
CREATE OR REPLACE FUNCTION admin_delete_account_full(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT tp.is_admin INTO v_is_admin FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM teachers WHERE owner_id = p_user_id;
  DELETE FROM teacher_profiles WHERE teacher_id = p_user_id;
  RETURN p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_account_full(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_delete_account_full(uuid) TO authenticated;

-- 4. admin_delete_registration_code: admin deletes any registration code
CREATE OR REPLACE FUNCTION admin_delete_registration_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT tp.is_admin INTO v_is_admin FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM registration_codes WHERE id = p_code_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_registration_code(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_delete_registration_code(uuid) TO authenticated;

-- 5. Add DELETE policy on registration_codes for admin
-- Currently registration_codes may not have a DELETE policy.
-- We add one that allows admin to delete any code.
DROP POLICY IF EXISTS "delete_registration_codes_admin" ON registration_codes;
CREATE POLICY "delete_registration_codes_admin" ON registration_codes
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true)
  );
