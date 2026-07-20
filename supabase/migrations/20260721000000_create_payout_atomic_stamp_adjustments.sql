-- Move the deduction/credit "applied" stamps inside create_payout_atomic's transaction.
--
-- WHY:
--   The deduction and credit "applied" stamps currently run in application code
--   AFTER this RPC commits. A silent stamp failure leaves adjustment rows in
--   'pending' state, so they remain re-appliable into the NEXT payout while the
--   caller has already followed a success redirect. That is the double-count
--   window. Moving the stamps inside the RPC's own transaction closes that
--   window structurally: the stamps and the payout succeed or fail together.
--
-- SEMANTICS:
--   The stamps are strict. Each UPDATE's affected row count must equal the
--   length of the array that was passed. A mismatch means at least one target
--   row was no longer 'pending' (already applied, or otherwise changed), which
--   raises 'adjustment_state_changed' and rolls back the ENTIRE transaction. As
--   a result, no payout is ever created on top of stale adjustment state. The
--   admin is expected to retry with freshly fetched adjustment state. An empty
--   (or NULL) array skips both the stamping UPDATE and its row-count check.
--
-- WHY DROP:
--   The live signature has five parameters. CREATE OR REPLACE FUNCTION cannot
--   add parameters to an existing function, so the function must be dropped and
--   recreated with the two new array parameters. The DROP also destroys the
--   EXECUTE grants established in 20260629000001, and a fresh CREATE defaults to
--   PUBLIC execute. This migration therefore re-establishes the lockdown on the
--   NEW signature in this same file: REVOKE EXECUTE from PUBLIC, anon, and
--   authenticated, then GRANT EXECUTE to service_role only.

DROP FUNCTION public.create_payout_atomic(uuid, bigint[], numeric, numeric, numeric);

CREATE FUNCTION public.create_payout_atomic(
  p_organizer_id UUID,
  p_booking_ids BIGINT[],
  p_total_amount NUMERIC,
  p_platform_commission NUMERIC,
  p_net_amount NUMERIC,
  p_deduction_ids UUID[],
  p_credit_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id   UUID;
  v_locked_ids  BIGINT[];
  v_stamped     INTEGER;
BEGIN
  -- FOR UPDATE cannot combine with array_agg, so we make two passes over the
  -- identical predicate in one transaction: lock the rows, then aggregate ids.
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

  -- NEW: deductions stamp, strict
  IF coalesce(array_length(p_deduction_ids, 1), 0) > 0 THEN
    UPDATE organizer_deductions
    SET status = 'applied', applied_payout_id = v_payout_id
    WHERE id = ANY(p_deduction_ids)
      AND status = 'pending';
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
    IF v_stamped <> array_length(p_deduction_ids, 1) THEN
      RAISE EXCEPTION 'adjustment_state_changed';
    END IF;
  END IF;

  -- NEW: credits stamp, strict, mirrors deductions
  IF coalesce(array_length(p_credit_ids, 1), 0) > 0 THEN
    UPDATE organizer_credits
    SET status = 'applied', applied_payout_id = v_payout_id
    WHERE id = ANY(p_credit_ids)
      AND status = 'pending';
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
    IF v_stamped <> array_length(p_credit_ids, 1) THEN
      RAISE EXCEPTION 'adjustment_state_changed';
    END IF;
  END IF;

  RETURN v_payout_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payout_atomic(uuid, bigint[], numeric, numeric, numeric, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payout_atomic(uuid, bigint[], numeric, numeric, numeric, uuid[], uuid[]) TO service_role;
