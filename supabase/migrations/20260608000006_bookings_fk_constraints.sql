-- Add foreign key constraint on bookings.trip_id to prevent orphaned bookings
-- if a trip is hard-deleted.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_trip_id_fkey
  FOREIGN KEY (trip_id) REFERENCES public.trips(id);
