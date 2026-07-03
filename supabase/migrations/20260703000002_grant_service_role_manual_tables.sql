-- Grant service_role the data privileges missing on tables that were created
-- manually in the SQL editor (the migration tooling's service_role grants were
-- never applied, so direct app access failed with 42501). Matches the privilege
-- set service_role already holds on bookings. Discovered during Stage 5e live
-- verification. GRANT is idempotent, so this is safe to re-run.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizer_credits    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizer_deductions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payouts              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_slug_redirects  TO service_role;
