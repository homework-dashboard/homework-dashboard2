/*
# Fix: "column reference 'teacher_id' is ambiguous"

## Root cause
`list_teacher_accounts()` returns `TABLE (teacher_id uuid, display_name text,
is_admin boolean)`. In PL/pgSQL, output columns are in scope as variables.
The authorization check inside the function uses unqualified `teacher_id`:

  SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true

PostgreSQL cannot tell whether `teacher_id` refers to the output parameter
or `teacher_profiles.teacher_id` — hence "ambiguous".

## Fix
Qualify all column references in the EXISTS check with a table alias.
Also qualify references in `set_admin_status` for consistency.
*/

CREATE OR REPLACE FUNCTION list_teacher_accounts()
RETURNS TABLE (teacher_id uuid, display_name text, is_admin boolean)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true
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
    SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE teacher_profiles SET is_admin = p_is_admin WHERE teacher_profiles.teacher_id = p_teacher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_admin_status(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION set_admin_status(uuid, boolean) TO authenticated;
