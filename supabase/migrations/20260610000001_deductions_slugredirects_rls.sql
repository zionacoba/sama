-- FIX 1: RLS for organizer_deductions
-- Only service role (used by server actions) can access deductions
-- No policies needed — all legitimate access uses the admin client which bypasses RLS
ALTER TABLE public.organizer_deductions ENABLE ROW LEVEL SECURITY;

-- FIX 2: RLS for trip_slug_redirects
-- Redirect lookup in app/trips/[slug]/page.tsx uses the admin client, so deny-all is safe
ALTER TABLE public.trip_slug_redirects ENABLE ROW LEVEL SECURITY;
