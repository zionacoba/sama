ALTER TABLE public.trips
ADD CONSTRAINT trips_status_check
CHECK (status IN ('draft', 'active', 'cancelled'));
