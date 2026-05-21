CREATE OR REPLACE FUNCTION book_slot(p_trip_id bigint, p_slots_requested int)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trips
  SET remaining_slots = remaining_slots - p_slots_requested
  WHERE id = p_trip_id
    AND remaining_slots >= p_slots_requested;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_enough_slots';
  END IF;
END;
$$;
