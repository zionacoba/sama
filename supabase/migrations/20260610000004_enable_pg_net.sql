-- Enable pg_net so pg_cron jobs can make HTTP POST calls to Edge Functions.
-- This was enabled manually in production; this migration captures it for reproducibility.
CREATE EXTENSION IF NOT EXISTS pg_net;
