/*
# Fix: cannot create registration codes

## Root cause
The `registration_codes` table had ALL grants revoked from `authenticated`
(migration 20260827103010). The `create_registration_code()` SECURITY DEFINER
function runs as `postgres` and should bypass RLS — but in practice the RPC
call from the browser fails because PostgREST needs the calling role to have
table-level INSERT privilege for the function's internal INSERT to succeed
through the API layer, even when the function itself is SECURITY DEFINER.

## Fix
1. GRANT INSERT, SELECT on `registration_codes` TO authenticated.
2. Replace the broad SELECT policy with an admin-only one (only admins can
   see the code list).
3. Add an admin-only INSERT policy (only admins can create codes).
4. Keep the UPDATE policy restricted — `consume_registration_code` handles
   updates via SECURITY DEFINER, but the policy stays as a fallback.
5. The frontend will generate the code client-side and INSERT directly,
   removing the dependency on the `create_registration_code` RPC.
6. The frontend will SELECT codes directly (admin-only policy enforces access).
7. Drop `create_registration_code` and `list_registration_codes` functions —
   no longer needed since direct table access is now policy-controlled.
*/

-- Grant INSERT and SELECT to authenticated
GRANT SELECT, INSERT ON registration_codes TO authenticated;

-- Drop old broad SELECT policy (was: authenticated USING (true))
DROP POLICY IF EXISTS "auth_select_reg_codes" ON registration_codes;
CREATE POLICY "admin_select_reg_codes" ON registration_codes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true)
  );

-- Add admin-only INSERT policy
DROP POLICY IF EXISTS "admin_insert_reg_codes" ON registration_codes;
CREATE POLICY "admin_insert_reg_codes" ON registration_codes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM teacher_profiles WHERE teacher_id = auth.uid() AND is_admin = true)
  );

-- Keep UPDATE policy for consume (restricted to authenticated)
DROP POLICY IF EXISTS "auth_update_reg_codes" ON registration_codes;
CREATE POLICY "auth_update_reg_codes" ON registration_codes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Drop functions no longer needed (direct table access via policies now)
DROP FUNCTION IF EXISTS create_registration_code();
DROP FUNCTION IF EXISTS list_registration_codes();
