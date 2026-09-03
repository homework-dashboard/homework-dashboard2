/*
# Fix get_my_teacher_profile to include must_change_password

## Overview
The get_my_teacher_profile() function was returning only (teacher_id,
display_name, is_admin) — missing the must_change_password column added
in a previous migration. The frontend checks this column to decide whether
to show the forced password-change dialog after an admin reset. Without
it, the flag was always undefined/falsy and the dialog never appeared.

## Changes
- DROP and recreate get_my_teacher_profile() to also return must_change_password.
*/

DROP FUNCTION IF EXISTS get_my_teacher_profile();

CREATE OR REPLACE FUNCTION get_my_teacher_profile()
RETURNS TABLE (teacher_id uuid, display_name text, is_admin boolean, must_change_password boolean)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT tp.teacher_id, tp.display_name, tp.is_admin, tp.must_change_password
    FROM teacher_profiles tp
    WHERE tp.teacher_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_teacher_profile() FROM anon;
GRANT EXECUTE ON FUNCTION get_my_teacher_profile() TO authenticated;
