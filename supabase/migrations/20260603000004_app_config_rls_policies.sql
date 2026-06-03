-- Deny all direct access from anon and authenticated roles
-- All legitimate access uses the admin client which bypasses RLS

REVOKE ALL ON public.app_config FROM anon, authenticated;
