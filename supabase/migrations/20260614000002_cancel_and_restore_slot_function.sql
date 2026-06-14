-- Documents the cancel_and_restore_slot function that already exists live, so a
-- db reset reproduces it. Cancels an abandoned payment_pending booking and
-- restores its slot in one transaction, removing the cancel-then-restore-then-
-- rollback dance the cleanup-abandoned-payments edge function used to do.
--
-- Returns true if it cancelled the booking and restored the slot; returns false
-- if the booking was no longer payment_pending (already changed by another path),
-- in which case nothing is touched. On any error the whole transaction rolls
-- back, so the booking stays payment_pending and the caller can retry.
CREATE OR REPLACE FUNCTION cancel_and_restore_slot(
  p_booking_id bigint,
  p_trip_id bigint,
  p_slots_requested int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id
    AND status = 'payment_pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN false;
  END IF;

  UPDATE trips
  SET remaining_slots = LEAST(total_slots, remaining_slots + p_slots_requested)
  WHERE id = p_trip_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_and_restore_slot(bigint, bigint, int) TO service_role;
