/*
# Fix gen_random_bytes error in create_registration_code

## Overview
The `create_registration_code` function used `gen_random_bytes()` from the
`pgcrypto` extension. Although pgcrypto is installed, it lives in the `extensions`
schema, not `public`, so `gen_random_bytes` is not on the default search path
and the function call fails with "function gen_random_bytes(integer) does not
exist".

## Fix
Replace `gen_random_bytes()` with `gen_random_uuid()`, which is built into
PostgreSQL core (no extension needed) and is always available. We generate a
UUID and extract hex characters from it to build the registration code.

## Changes
- `create_registration_code()` — rewritten to use `gen_random_uuid()` instead of
  `gen_random_bytes()`. The code format is now `XXXX-XXXXXX` (10 hex chars),
  same as before.
*/

CREATE OR REPLACE FUNCTION create_registration_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uuid text;
  v_code text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_uuid := gen_random_uuid()::text;
  v_code := upper(substr(replace(v_uuid, '-', ''), 1, 4) || '-' || substr(replace(v_uuid, '-', ''), 5, 6));

  INSERT INTO registration_codes (code) VALUES (v_code);

  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_registration_code() FROM anon;
GRANT EXECUTE ON FUNCTION create_registration_code() TO authenticated;
