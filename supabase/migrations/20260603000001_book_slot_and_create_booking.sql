-- Atomic function that decrements remaining_slots and inserts the booking row
-- in a single transaction, eliminating the slot-leak window that existed when
-- the two operations ran as separate app-layer calls.
CREATE OR REPLACE FUNCTION book_slot_and_create_booking(
  p_trip_id                  bigint,
  p_user_id                  uuid,
  p_slots_requested          integer,
  p_full_name                text,
  p_email                    text,
  p_phone                    text,
  p_total_amount             numeric,
  p_status                   text,
  p_notes                    text,
  p_payment_option           text,
  p_amount_due               numeric,
  p_participants             text[],
  p_emergency_contact_name   text,
  p_emergency_contact_phone  text,
  p_waiver_agreed            boolean,
  p_waiver_agreed_at         timestamptz,
  p_platform_waiver_agreed   boolean,
  p_medical_notes            text,
  p_meeting_point            text,
  p_platform_commission      numeric,
  p_commission_rate_used     numeric,
  p_waiver_text_snapshot     text,
  p_waiver_ip                text,
  p_platform_waiver_snapshot text
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_id bigint;
BEGIN
  UPDATE trips
  SET remaining_slots = remaining_slots - p_slots_requested
  WHERE id = p_trip_id
    AND remaining_slots >= p_slots_requested;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_enough_slots';
  END IF;

  INSERT INTO bookings (
    trip_id,
    user_id,
    full_name,
    email,
    phone,
    slots,
    total_amount,
    status,
    notes,
    payment_option,
    amount_due,
    participants,
    emergency_contact_name,
    emergency_contact_phone,
    waiver_agreed,
    waiver_agreed_at,
    platform_waiver_agreed,
    medical_notes,
    meeting_point,
    platform_commission,
    commission_rate_used,
    waiver_text_snapshot,
    waiver_ip,
    platform_waiver_snapshot
  ) VALUES (
    p_trip_id,
    p_user_id,
    p_full_name,
    p_email,
    p_phone,
    p_slots_requested,
    p_total_amount,
    p_status,
    p_notes,
    p_payment_option,
    p_amount_due,
    p_participants,
    p_emergency_contact_name,
    p_emergency_contact_phone,
    p_waiver_agreed,
    p_waiver_agreed_at,
    p_platform_waiver_agreed,
    p_medical_notes,
    p_meeting_point,
    p_platform_commission,
    p_commission_rate_used,
    p_waiver_text_snapshot,
    p_waiver_ip,
    p_platform_waiver_snapshot
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;
