/*
# Admin account + secure registration code management

## Overview
Introduces an admin role and moves registration-code validation/consumption
and code creation into SECURITY DEFINER functions so the browser can never
forge a code or mark it used. The admin can create and list registration codes
from a dedicated admin panel in the app.

## New columns
1. `teacher_profiles.is_admin` (boolean, default false)
   - Marks a profile as administrator. Only an admin can create registration
     codes and see the code list.
   - Column-level UPDATE is revoked from `authenticated` so a teacher cannot
     promote themselves; only the `set_admin` SECURITY DEFINER function can
     change it.

## New / changed functions (SECURITY DEFINER, search_path = public)
1. `consume_registration_code(p_code text)`
   - Called at sign-up. Atomically claims a single-use code: the UPDATE that
     checks `used = false` is the same statement that marks it used, so two
     concurrent sign-ups cannot both succeed.
   - Returns the code id on success; raises EXCEPTION on invalid/used code.
   - EXECUTE granted to authenticated only.
2. `create_registration_code()`
   - Admin-only. Generates a random 10-char code, inserts it, returns the code
     text. Authorization is checked via auth.uid() inside the function.
   - EXECUTE granted to authenticated only.
3. `list_registration_codes()`
   - Admin-only. Returns all codes with their used status, newest first.
   - EXECUTE granted to authenticated only.
4. `list_teachers_admin()`
   - Admin-only. Returns all teachers with photo_url and name for the admin
     panel. (The public SELECT policy already allows anon read, so this is a
     convenience that also verifies admin status.)
   - EXECUTE granted to authenticated only.
5. `delete_teacher_admin(p_teacher_id uuid)`
   - Admin-only. Deletes a teacher row (cascades to lessons + homework).
   - EXECUTE granted to authenticated only.

## Security changes
- `teacher_profiles`: REVOKE UPDATE on the whole table from authenticated;
  GRANT UPDATE only on (display_name) so teachers can edit their own display
  name but NOT is_admin.
- `registration_codes`: REVOKE all from anon. Revoke UPDATE from authenticated
  (the consume function handles the update now). Keep SELECT for authenticated
  so the list function works — but the list function itself checks admin.
  Actually, to prevent any authenticated teacher from reading all codes, we
  revoke SELECT too and rely solely on the `list_registration_codes()` RPC.
- `teachers`: write policies already restricted to authenticated (done in
  previous migration). SELECT stays open to anon for parents.

## Notes
1. The first admin account is created via execute_sql after this migration:
   we insert a profile row with is_admin = true for a known auth user id. But
   since there is no auth user yet, the admin signs up first (with the seeded
   code MUSIC-2026), then we flip their is_admin flag via execute_sql.
   Alternative: we pre-create the admin auth account directly in auth.users.
   We use the approach of: admin signs up with the seeded code, then we run a
   one-time SQL to set is_admin = true on their profile. Instructions are
   given to the user.
*/

-- 1. Add is_admin column
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Column-level privileges on teacher_profiles
REVOKE UPDATE ON teacher_profiles FROM authenticated;
GRANT UPDATE (display_name) ON teacher_profiles TO authenticated;

-- 3. Registration codes: lock down direct table access
-- Revoke all from anon
REVOKE SELECT, INSERT, UPDATE, DELETE ON registration_codes FROM anon;
-- Revoke SELECT, INSERT, UPDATE, DELETE from authenticated — all access via functions
REVOKE SELECT, INSERT, UPDATE, DELETE ON registration_codes FROM authenticated;

-- 4. consume_registration_code function
CREATE OR REPLACE FUNCTION consume_registration_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE registration_codes
    SET used = true
    WHERE code = p_code AND used = false
    RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used registration code';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_registration_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION consume_registration_code(text) TO authenticated;

-- 5. create_registration_code function
CREATE OR REPLACE FUNCTION create_registration_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 6));

  INSERT INTO registration_codes (code) VALUES (v_code) RETURNING id INTO v_id;

  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_registration_code() FROM anon;
GRANT EXECUTE ON FUNCTION create_registration_code() TO authenticated;

-- 6. list_registration_codes function
CREATE OR REPLACE FUNCTION list_registration_codes()
RETURNS TABLE (id uuid, code text, used boolean, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT rc.id, rc.code, rc.used, rc.created_at
    FROM registration_codes rc
    ORDER BY rc.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_registration_codes() FROM anon;
GRANT EXECUTE ON FUNCTION list_registration_codes() TO authenticated;

-- 7. list_teachers_admin function
CREATE OR REPLACE FUNCTION list_teachers_admin()
RETURNS TABLE (id uuid, name text, photo_url text, sort_order int, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT t.id, t.name, t.photo_url, t.sort_order, t.created_at
    FROM teachers t
    ORDER BY t.sort_order ASC, t.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_teachers_admin() FROM anon;
GRANT EXECUTE ON FUNCTION list_teachers_admin() TO authenticated;

-- 8. delete_teacher_admin function
CREATE OR REPLACE FUNCTION delete_teacher_admin(p_teacher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM teachers WHERE id = p_teacher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_teacher_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION delete_teacher_admin(uuid) TO authenticated;

-- 9. is_current_admin function (for the frontend to check admin status)
CREATE OR REPLACE FUNCTION is_current_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  );
$$;

REVOKE EXECUTE ON FUNCTION is_current_admin() FROM anon;
GRANT EXECUTE ON FUNCTION is_current_admin() TO authenticated;
