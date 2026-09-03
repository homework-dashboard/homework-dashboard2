/*
# Fix: ensure authenticated has UPDATE on registration_codes

The consume_registration_code() SECURITY DEFINER function performs an UPDATE
on registration_codes. While SECURITY DEFINER bypasses RLS, PostgREST may
still check the calling role's table-level UPDATE privilege before allowing
the RPC. The previous migration (fix_registration_codes_grants) only granted
SELECT and INSERT. Adding UPDATE so consume works reliably.
*/

GRANT UPDATE ON registration_codes TO authenticated;
