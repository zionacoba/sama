-- FIX 4: Include 'transferred' bookings when locking rows for payout creation.
--
-- WHY:
-- A transferred slot pays out to the organizer (they run the trip for the
-- replacement joiner). Commit c129106 added "transferred" to ATTENDED_STATUSES
-- in the app layer, so app/actions/admin.ts now selects transferred bookings,
-- includes their amount in the payout total, and passes their ids to this RPC.
-- This function's lock filter still said status IN ('confirmed','no_show'),
-- which DISAGREES with the app: on a mixed batch the transferred booking's
-- money is counted in total_amount but the row is never locked, never attached
-- to the payout, and never marked payout_status='included' -- so it stays
-- 'unpaid' and can be swept into a SECOND payout later (double-pay). This
-- change realigns the RPC with ATTENDED_STATUSES.
--
-- SCOPE: exactly ONE line changes -- the single status filter in the lock
-- SELECT. The UPDATE that marks rows keys off v_locked_ids (not status), and
-- total/net are computed in the app and passed in, so lock, mark, and total
-- all stay consistent by construction. Everything else is byte-identical to
-- the current live definition.
--
-- GRANTS: intentionally NOT touched. CREATE OR REPLACE preserves the existing
-- EXECUTE grants, so the service_role-only lockdown from
-- 20260629000001_lockdown_rpc_execute_grants.sql persists. We deliberately do
-- NOT add any GRANT/REVOKE here, which could accidentally re-open PUBLIC
-- execute on this SECURITY DEFINER money RPC.
--
-- SEARCH_PATH: search_path = public is restated below ON PURPOSE. Unlike
-- grants, CREATE OR REPLACE FUNCTION RESETS any SET clause that is not repeated
-- in the command. The live function's search_path was pinned by the ALTER
-- FUNCTION in 20260629000001; omitting it here would silently strip search_path
-- hardening off a SECURITY DEFINER function (search_path-hijack risk). It is
-- kept identical to the live setting.
--
-- This migration is DOCUMENTATION-OF-RECORD. It is NOT live until it is run
-- manually in the Supabase SQL Editor (repo convention: migrations here are
-- applied by hand, not by an automated runner).

CREATE OR REPLACE FUNCTION create_payout_atomic(
  p_organizer_id  UUID,
  p_booking_ids   BIGINT[],
  p_total_amount  NUMERIC,
  p_platform_commission NUMERIC,
  p_net_amount    NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id   UUID;
  v_locked_ids  BIGINT[];
BEGIN
  -- Lock rows and filter to those still eligible, preventing concurrent payouts.
  SELECT array_agg(id ORDER BY id) INTO v_locked_ids
  FROM bookings
  WHERE id = ANY(p_booking_ids)
    AND payout_status = 'unpaid'
    AND status = ANY(ARRAY['confirmed', 'no_show', 'transferred'])
  FOR UPDATE;

  IF v_locked_ids IS NULL OR array_length(v_locked_ids, 1) = 0 THEN
    RAISE EXCEPTION 'no_eligible_bookings';
  END IF;

  INSERT INTO payouts (organizer_id, booking_ids, total_amount, platform_commission, net_amount, status)
  VALUES (p_organizer_id, v_locked_ids, p_total_amount, p_platform_commission, p_net_amount, 'pending')
  RETURNING id INTO v_payout_id;

  UPDATE bookings
  SET payout_status = 'included', payout_id = v_payout_id
  WHERE id = ANY(v_locked_ids);

  RETURN v_payout_id;
END;
$$;

-- ============================================================================
-- MANUAL VERIFICATION (run in Supabase SQL Editor -- NOT part of apply)
-- ============================================================================
--
-- (a) BEFORE applying -- confirm the live signature and that the current body
--     still filters only 'confirmed','no_show':
--
--     \df+ create_payout_atomic
--
--     SELECT pg_get_functiondef(p.oid)
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'create_payout_atomic';
--     -- Expect the body to contain: status IN ('confirmed', 'no_show')
--     -- Expect exactly one row / one signature: (uuid, bigint[], numeric, numeric, numeric)
--
-- (b) AFTER applying -- confirm the body now includes 'transferred':
--
--     SELECT pg_get_functiondef(p.oid)
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'create_payout_atomic';
--     -- Expect the lock filter to read:
--     --   status = ANY (ARRAY['confirmed'::text, 'no_show'::text, 'transferred'::text])
--     -- Expect "SET search_path TO public" still present and "SECURITY DEFINER" intact.
--
-- (c) AFTER applying -- confirm EXECUTE is still service_role-only and NOT
--     granted to PUBLIC/anon/authenticated (proves CREATE OR REPLACE preserved
--     the lockdown):
--
--     \df+ create_payout_atomic          -- inspect the "Access privileges" column
--
--     SELECT p.proname, p.proacl
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'create_payout_atomic';
--     -- Expect proacl to grant EXECUTE (=X) to service_role only.
--     -- Expect NO entry granting execute to PUBLIC (an ACL item with an empty
--     -- grantee, i.e. "=X/..."), anon, or authenticated.
-- ============================================================================
