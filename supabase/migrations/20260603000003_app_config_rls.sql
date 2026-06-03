ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Block all direct REST API access — all legitimate access uses the admin client
