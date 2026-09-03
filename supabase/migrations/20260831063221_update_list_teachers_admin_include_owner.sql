/*
# Update list_teachers_admin to include owner_id

## Overview
The admin panel needs to show which board sections are assigned to which
teacher accounts, and which are unassigned. This updates the
list_teachers_admin function to also return owner_id.
*/

DROP FUNCTION IF EXISTS list_teachers_admin();

CREATE OR REPLACE FUNCTION list_teachers_admin()
RETURNS TABLE (id uuid, name text, photo_url text, sort_order int, created_at timestamptz, owner_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT t.id, t.name, t.photo_url, t.sort_order, t.created_at, t.owner_id
    FROM teachers t
    ORDER BY t.sort_order ASC, t.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_teachers_admin() FROM anon;
GRANT EXECUTE ON FUNCTION list_teachers_admin() TO authenticated;
