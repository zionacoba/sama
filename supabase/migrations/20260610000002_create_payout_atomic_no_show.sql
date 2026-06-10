-- FIX 3: Include no_show bookings when locking rows for payout creation.
-- Previously only status = 'confirmed' was eligible, leaving no_show bookings stuck unpaid.
CREATE OR REPLACE FUNCTION create_payout_atomic(
  p_organizer_id  UUID,
  p_booking_ids   BIGINT[],
  p_total_amount  NUMERIC,
  p_platform_commission NUMERIC,
  p_net_amount    NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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
    AND status IN ('confirmed', 'no_show')
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
