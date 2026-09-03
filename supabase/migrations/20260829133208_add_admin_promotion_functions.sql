/*
# Add admin promotion/demotion from the admin panel

## Overview
Currently the only way to make someone an admin is via the ADMIN-BOOTSTRAP
registration code, which is single-use and already consumed. This migration
adds two SECURITY DEFINER functions so an existing admin can:
  1. List all registered teacher accounts (teacher_profiles) with their
     admin status — normally blocked by the owner-only SELECT policy.
  2. Promote or demote any registered teacher to/from admin.

## New functions
1. `list_teacher_accounts()` — admin-only, returns (teacher_id, display_name, is_admin)
2. `set_admin_status(p_teacher_id uuid, p_is_admin boolean)` — admin-only,
   updates is_admin on the target teacher_profiles row.

## Security
- Both functions check `auth.uid()` against teacher_profiles.is_admin.
- is_admin column-level UPDATE stays revoked from authenticated — only this
  SECURITY DEFINER function can change it.
- EXECUTE revoked from anon, granted to authenticated.
*/

CREATE OR REPLACE FUNCTION list_teacher_accounts()
RETURNS TABLE (teacher_id uuid, display_name text, is_admin boolean)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT tp.teacher_id, tp.display_name, tp.is_admin
    FROM teacher_profiles tp
    ORDER BY tp.is_admin DESC, tp.display_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_teacher_accounts() FROM anon;
GRANT EXECUTE ON FUNCTION list_teacher_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION set_admin_status(p_teacher_id uuid, p_is_admin boolean)
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

  UPDATE teacher_profiles SET is_admin = p_is_admin WHERE teacher_id = p_teacher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_admin_status(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION set_admin_status(uuid, boolean) TO authenticated;
