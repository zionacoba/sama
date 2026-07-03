-- FIX: create_payout_atomic combined an aggregate (array_agg) with FOR UPDATE in
-- a single query. Postgres forbids this (ERROR 0A000: FOR UPDATE is not allowed
-- with aggregate functions), so the function threw on its very first statement
-- every call and has never successfully created a payout (the payouts table is
-- empty). This is a separate bug from the booking_ids column type, fixed in
-- 20260703000003.
--
-- THE FIX: split the one offending statement into two over the IDENTICAL
-- predicate:
--   1. a PERFORM ... FOR UPDATE that takes the row locks, and
--   2. a plain array_agg SELECT (no FOR UPDATE) that collects the locked ids.
-- Atomicity is preserved: both statements execute in the function's single
-- transaction, and the FOR UPDATE locks are held until that transaction ends
-- (after the function returns), so no concurrent transaction can flip
-- payout_status between the lock and the aggregate. The eligibility predicate,
-- the no_eligible_bookings guard, the payouts insert, the bookings UPDATE to
-- 'included', and the return value are all unchanged.
--
-- CREATE OR REPLACE (never DROP) so the existing EXECUTE grants and ownership
-- from 20260629000001_lockdown_rpc_execute_grants.sql are preserved (service_role
-- only). No GRANT/REVOKE is added here, keeping that lockdown intact.
--
-- SEARCH_PATH: SET search_path = public is restated ON PURPOSE. CREATE OR REPLACE
-- FUNCTION resets any SET clause not repeated in the command; omitting it would
-- strip search_path hardening off this SECURITY DEFINER money RPC. Kept identical
-- to the live setting.
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
  -- Lock the eligible rows first, preventing concurrent payouts. FOR UPDATE
  -- cannot be combined with an aggregate in one query, so take the row locks
  -- with a plain PERFORM here, then collect their ids with array_agg below over
  -- the identical predicate. Both run in this function's single transaction, so
  -- the locks are held until return and the two statements see the same rows.
  PERFORM id
  FROM bookings
  WHERE id = ANY(p_booking_ids)
    AND payout_status = 'unpaid'
    AND status = ANY(ARRAY['confirmed', 'no_show', 'transferred'])
  FOR UPDATE;

  SELECT array_agg(id ORDER BY id) INTO v_locked_ids
  FROM bookings
  WHERE id = ANY(p_booking_ids)
    AND payout_status = 'unpaid'
    AND status = ANY(ARRAY['confirmed', 'no_show', 'transferred']);

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
