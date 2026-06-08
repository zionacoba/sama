DROP INDEX IF EXISTS bookings_active_user_trip_unique;
CREATE UNIQUE INDEX bookings_active_user_trip_unique ON public.bookings (user_id, trip_id) WHERE status NOT IN ('cancelled', 'rejected', 'transferred');
