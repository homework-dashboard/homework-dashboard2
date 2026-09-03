/*
# Add must_change_password flag and fix admin_reset function

## Overview
Adds a `must_change_password` boolean to teacher_profiles so the frontend
can force a password change after an admin reset. Replaces the broken
admin_reset_user_password database function (auth.admin.update_user is not
available in PL/pgSQL) — the actual password reset is handled by an edge
function instead.

## Changes
1. `teacher_profiles.must_change_password` (boolean, default false)
   - Set to true when admin resets a user's password.
   - Frontend checks this on login and shows a forced change-password dialog.
   - Cleared when the user changes their password.

2. Drop the broken admin_reset_user_password function (replaced by edge function).

3. New function: `clear_must_change_password()` — called by the frontend
   after a successful password change to clear the flag.
*/

ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Grant UPDATE on must_change_password column to authenticated (needed for clear function)
-- Actually, the clear function is SECURITY DEFINER so it bypasses RLS.
-- But we need the column to be visible (SELECT includes it already via owner_select_profile).

-- Drop the broken function
DROP FUNCTION IF EXISTS admin_reset_user_password(uuid);

-- New function: set_must_change_password (admin-only, sets the flag on a target user)
CREATE OR REPLACE FUNCTION set_must_change_password(p_user_id uuid)
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

  UPDATE teacher_profiles SET must_change_password = true WHERE teacher_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_must_change_password(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION set_must_change_password(uuid) TO authenticated;

-- New function: clear_must_change_password (self-service, clears own flag)
CREATE OR REPLACE FUNCTION clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE teacher_profiles SET must_change_password = false WHERE teacher_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION clear_must_change_password() FROM anon;
GRANT EXECUTE ON FUNCTION clear_must_change_password() TO authenticated;
