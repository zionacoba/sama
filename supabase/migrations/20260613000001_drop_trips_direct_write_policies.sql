-- Drop direct-PostgREST write policies on public.trips.
--
-- WHY:
-- Trips writes no longer go through the anon/authenticated PostgREST client.
-- All trip creation and mutation flows through the admin/service-role client in
-- server actions (createTrip / updateTrip / publishTrip), each of which performs
-- explicit in-code authorization checks (verifying the caller owns an approved
-- organizer profile, validating input, enforcing status transitions, etc.).
--
-- Leaving direct INSERT/UPDATE RLS policies in place would let an organizer write
-- to the trips table directly via PostgREST, bypassing that server-action
-- validation. We therefore intentionally remove these two policies so that the
-- trips table is left with ONLY its two SELECT policies:
--   - "Public can view active trips"
--   - "Organizers can view their own trips"
--
-- This migration is the authoritative fix. Earlier migrations
-- (20260528000000_rls_policies.sql, 20260608000003_trips_update_rls_approved.sql)
-- created these policies; this trailing migration always runs last and drops
-- them. The CREATE blocks in 20260528000000_rls_policies.sql have also been
-- commented out so a full `db reset` never recreates them.
--
-- Both statements use IF EXISTS so this migration is idempotent and safe to run
-- whether or not the policies are currently present.

DROP POLICY IF EXISTS "Approved organizers can create trips" ON public.trips;
DROP POLICY IF EXISTS "Organizers can update their own trips" ON public.trips;
