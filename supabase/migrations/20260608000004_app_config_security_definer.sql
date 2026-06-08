-- Replace the broad SELECT grant on app_config with a SECURITY DEFINER function.
-- The function runs as its owner (postgres) so RLS policies can call it without
-- direct table access being granted to anon/authenticated.

CREATE OR REPLACE FUNCTION get_admin_email()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT value FROM public.app_config WHERE key = 'admin_email';
$$;

GRANT EXECUTE ON FUNCTION get_admin_email() TO authenticated, anon;

-- Update the three RLS policies that previously queried app_config directly.
DROP POLICY IF EXISTS "Admin can view all bookings" ON public.bookings;
CREATE POLICY "Admin can view all bookings"
ON public.bookings FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'email') = get_admin_email()
);

DROP POLICY IF EXISTS "Admin can update status" ON public.organizers;
CREATE POLICY "Admin can update status"
ON public.organizers FOR UPDATE
TO public
USING (
  (auth.jwt() ->> 'email') = get_admin_email()
);

DROP POLICY IF EXISTS "Users view own, admin views all" ON public.organizers;
CREATE POLICY "Users view own, admin views all"
ON public.organizers FOR SELECT
TO public
USING (
  (auth.uid() = user_id)
  OR ((auth.jwt() ->> 'email') = get_admin_email())
);

-- Revoke direct SELECT access now that policies use the function instead.
REVOKE SELECT ON public.app_config FROM anon, authenticated;
