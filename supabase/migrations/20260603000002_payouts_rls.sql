ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Only service role (used by server actions) can access payouts
-- No policies needed since all legitimate access uses the admin client which bypasses RLS
-- This blocks anon and authenticated roles from direct REST API access
