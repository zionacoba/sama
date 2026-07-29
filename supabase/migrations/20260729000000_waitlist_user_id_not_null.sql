-- Make public.waitlist.user_id NOT NULL.
--
-- WHY:
--   The application already guarantees a non-null user_id at its only insert
--   path (joinWaitlist in app/actions/waitlist.ts returns early when there is
--   no authenticated user). This moves that guarantee from application code
--   into the database, so the unique index on (trip_id, user_id) constrains
--   every row rather than exempting rows with a null user_id.

ALTER TABLE public.waitlist ALTER COLUMN user_id SET NOT NULL;
