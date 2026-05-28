-- Platform configuration table. Stores non-sensitive key/value config.
-- No RLS — values are intentionally readable by policy subqueries.
CREATE TABLE IF NOT EXISTS public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Seed the admin email. Use ON CONFLICT so re-running this is safe.
INSERT INTO public.app_config (key, value)
VALUES ('admin_email', 'acobapaulzion@gmail.com')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Replace hardcoded admin email in RLS policies with a lookup
-- against app_config. Drop and recreate each affected policy.
-- ============================================================

-- BOOKINGS: admin read access
DROP POLICY IF EXISTS "Admin can view all bookings" ON public.bookings;
CREATE POLICY "Admin can view all bookings"
ON public.bookings FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'email') = (SELECT value FROM public.app_config WHERE key = 'admin_email')
);

-- ORGANIZERS: admin can update status
DROP POLICY IF EXISTS "Admin can update status" ON public.organizers;
CREATE POLICY "Admin can update status"
ON public.organizers FOR UPDATE
TO public
USING (
  (auth.jwt() ->> 'email') = (SELECT value FROM public.app_config WHERE key = 'admin_email')
);

-- ORGANIZERS: users see own, admin sees all
DROP POLICY IF EXISTS "Users view own, admin views all" ON public.organizers;
CREATE POLICY "Users view own, admin views all"
ON public.organizers FOR SELECT
TO public
USING (
  (auth.uid() = user_id)
  OR ((auth.jwt() ->> 'email') = (SELECT value FROM public.app_config WHERE key = 'admin_email'))
);
