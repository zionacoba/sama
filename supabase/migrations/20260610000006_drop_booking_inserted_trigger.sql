-- Remove the duplicate slot-decrement trigger.
-- book_slot_and_create_booking already decrements remaining_slots atomically;
-- this trigger caused every booking to decrement twice. Dropped in production; captured here.
DROP TRIGGER IF EXISTS on_booking_inserted ON public.bookings;
DROP FUNCTION IF EXISTS decrement_remaining_slots();
