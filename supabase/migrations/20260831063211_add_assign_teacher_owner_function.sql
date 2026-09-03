/*
# Admin: assign board section ownership

## Overview
Allows an admin to assign (or reassign) a teacher's board section (the
`teachers` row) to a registered teacher account. This is needed when:
- A teacher account was created before the auto-create-on-registration
  feature, so they have no board section.
- An admin wants to reassign a board section from one teacher to another.

## New function
- `assign_teacher_owner(p_teacher_id uuid, p_owner_id uuid)` — admin-only.
  Sets the owner_id on the teachers row. If p_owner_id is null, clears it.
  Returns void.

## Security
- Checks auth.uid() against teacher_profiles.is_admin.
- SECURITY DEFINER, search_path = public.
*/

CREATE OR REPLACE FUNCTION assign_teacher_owner(p_teacher_id uuid, p_owner_id uuid)
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

  UPDATE teachers SET owner_id = p_owner_id WHERE id = p_teacher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_teacher_owner(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION assign_teacher_owner(uuid, uuid) TO authenticated;
