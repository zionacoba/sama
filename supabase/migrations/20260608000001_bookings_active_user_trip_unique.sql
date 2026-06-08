-- Prevents duplicate active bookings for the same user+trip at the DB level,
-- closing the TOCTOU window between the app-layer guard and the INSERT.
CREATE UNIQUE INDEX bookings_active_user_trip_unique
  ON public.bookings (user_id, trip_id)
  WHERE status NOT IN ('cancelled', 'rejected');
