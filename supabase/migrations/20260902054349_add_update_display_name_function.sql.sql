/*
# Add update_my_display_name function

## Overview
Allows a logged-in teacher to update their own display_name in teacher_profiles.
This is used by the profile modal so teachers can rename themselves.

## Changes
- New function: update_my_display_name(p_display_name text)
  - SECURITY DEFINER, updates teacher_profiles.display_name where teacher_id = auth.uid()
  - Returns void
  - Only authenticated users can call it

## Security
- Function checks auth.uid() ownership — only the owner can update their name.
*/

CREATE OR REPLACE FUNCTION update_my_display_name(p_display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Имя не может быть пустым';
  END IF;

  UPDATE teacher_profiles
  SET display_name = trim(p_display_name)
  WHERE teacher_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Профиль не найден';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_my_display_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION update_my_display_name(text) TO authenticated;
