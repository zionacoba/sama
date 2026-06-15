-- Lock down direct-PostgREST writes on public.bookings.
--
-- WHY:
-- Booking writes do not go through the anon/authenticated PostgREST client.
-- All booking creation and mutation flows through the admin/service-role client
-- in server actions (book_slot_and_create_booking, payment handling, status
-- transitions such as no-show / transfer / refund), each of which performs
-- explicit in-code authorization. This is the same model already applied to the
-- trips table in 20260613000001_drop_trips_direct_write_policies.sql.
--
-- A security regression audit found the lockdown relied on a single layer. The
-- live database already had the permissive write policies removed and the
-- anon/authenticated write grants revoked (verified correct in production), but
-- the repo still recreated them on a full `db reset`:
--   - 20260528000000_rls_policies.sql created a permissive
--     "Authenticated users can insert bookings" INSERT policy
--     (WITH CHECK auth.uid() IS NOT NULL, no field constraints) which would let
--     any authenticated user forge a paid booking row, and an
--     "Organizers can update bookings on their trips" UPDATE policy.
-- Those CREATE blocks have now been commented out in that file, and this trailing
-- migration makes the locked-down state explicit and reproducible so the repo
-- matches the hardened live state and a `db reset` cannot reopen the hole.
--
-- AFTER THIS MIGRATION, bookings is left with ONLY its two SELECT policies:
--   - "Admin can view all bookings"
--   - "Organizers can read bookings on their trips"
-- anon/authenticated have SELECT-only access via RLS, AND no INSERT/UPDATE/DELETE
-- table grants (defense in depth). service_role grants are left intact because
-- the admin client depends on them.
--
-- Idempotent and safe to replay: drops use IF EXISTS; REVOKE is idempotent.

-- 1. Drop the permissive direct-write policies if present (whether created by an
--    old migration or a manual action), so a reset ends with them gone.
DROP POLICY IF EXISTS "Authenticated users can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Organizers can update bookings on their trips" ON public.bookings;

-- 2. Revoke write grants from anon and authenticated (matches live). All booking
--    writes go through the service_role admin client, so these roles need SELECT
--    only. This is the grant-level half of the defense-in-depth lockdown.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bookings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bookings FROM authenticated;

-- NOTE: service_role grants are intentionally left untouched; the admin client
-- (supabaseAdmin) performs all booking writes and must retain full access.
