-- FIX 4: Restrict public review reads to approved reviews only.
-- The old policy used USING (true) which exposed unapproved/moderated reviews via REST API.
-- Admin moderation (getPendingReviews) uses the service-role client and bypasses RLS.
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.reviews;

CREATE POLICY "Anyone can read approved reviews"
ON public.reviews FOR SELECT
TO anon, authenticated
USING (approved = true);
