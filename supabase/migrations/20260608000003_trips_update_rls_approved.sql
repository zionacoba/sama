-- Tighten the trips UPDATE policy to require organizer status = 'approved'.
-- Previously, pending or rejected organizers could update trips directly via the REST API.
DROP POLICY IF EXISTS "Organizers can update their own trips" ON public.trips;

CREATE POLICY "Organizers can update their own trips"
ON public.trips FOR UPDATE
TO public
USING (
  organizer_id IN (
    SELECT organizers.id FROM organizers
    WHERE organizers.user_id = auth.uid()
    AND organizers.status = 'approved'
  )
);
