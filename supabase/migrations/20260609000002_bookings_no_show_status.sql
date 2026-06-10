-- Add no_show as a valid booking status and enforce allowed values with a check constraint.
-- No prior constraint existed on bookings.status.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'payment_pending', 'confirmed', 'rejected', 'cancelled', 'transferred', 'no_show'));
