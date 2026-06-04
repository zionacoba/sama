-- Allow anon and authenticated to SELECT from app_config
-- This is needed for RLS policies that check admin_email
-- INSERT, UPDATE, DELETE remain revoked
GRANT SELECT ON public.app_config TO anon, authenticated;
