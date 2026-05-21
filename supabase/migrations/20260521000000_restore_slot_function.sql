-- Compensating function for book_slot: adds slots back to a trip.
-- Called when the booking record insert fails after book_slot has
-- already decremented remaining_slots, to avoid permanently losing capacity.
CREATE OR REPLACE FUNCTION restore_slot(p_trip_id bigint, p_slots_requested int)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trips
  SET remaining_slots = LEAST(total_slots, remaining_slots + p_slots_requested)
  WHERE id = p_trip_id;
END;
$$;
