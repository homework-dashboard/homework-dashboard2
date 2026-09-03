/*
# Fix admin account creation — bootstrap admin via special code

## Overview
The original approach created the admin account by inserting directly into
`auth.users`, but GoTrue (Supabase Auth) does not reliably recognize passwords
hashed via SQL `crypt()` — the password hash format and verification path
differ from what GoTrue writes. As a result the admin could never sign in.

This migration switches to a bootstrap approach: a special registration code
`ADMIN-BOOTSTRAP` is seeded. When a teacher signs up using this code, the
`consume_registration_code` function automatically sets `is_admin = true` on
their new profile. This way the admin account is created through the normal
Supabase Auth signUp flow, so the password is hashed correctly by GoTrue.

## Changes
1. `consume_registration_code(p_code text)` — updated to set `is_admin = true`
   on the caller's `teacher_profiles` row when the code is `ADMIN-BOOTSTRAP`.
   For normal codes, `is_admin` stays false.
2. Seed the `ADMIN-BOOTSTRAP` registration code (single-use, currently unused).
3. The old `MUSIC-2026` code is reset to unused so a teacher can still use it.

## Security
- `is_admin` is still not client-writable: the column-level UPDATE privilege
  remains revoked from `authenticated`. Only this SECURITY DEFINER function
  (which runs as the owner) can set it.
- The `ADMIN-BOOTSTRAP` code is single-use like every other code.
*/

-- Reset MUSIC-2026 to unused in case it was consumed during testing
UPDATE registration_codes SET used = false WHERE code = 'MUSIC-2026';

-- Seed the admin bootstrap code
INSERT INTO registration_codes (code)
SELECT 'ADMIN-BOOTSTRAP' WHERE NOT EXISTS (
  SELECT 1 FROM registration_codes WHERE code = 'ADMIN-BOOTSTRAP'
);

-- Recreate consume_registration_code with admin bootstrap logic
CREATE OR REPLACE FUNCTION consume_registration_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_is_admin boolean := false;
BEGIN
  -- Atomically claim the code
  UPDATE registration_codes
    SET used = true
    WHERE code = p_code AND used = false
    RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used registration code';
  END IF;

  -- If this is the admin bootstrap code, promote the caller to admin
  IF p_code = 'ADMIN-BOOTSTRAP' THEN
    v_is_admin := true;
  END IF;

  -- Set is_admin on the caller's profile (only works for the admin bootstrap code)
  IF v_is_admin THEN
    UPDATE teacher_profiles
      SET is_admin = true
      WHERE teacher_id = auth.uid();
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_registration_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION consume_registration_code(text) TO authenticated;
