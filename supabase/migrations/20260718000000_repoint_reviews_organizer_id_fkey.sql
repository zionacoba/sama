-- Re-point reviews.organizer_id foreign key from auth.users(id) to organizers(id)
--
-- Background:
--   reviews.organizer_id has always received organizers.id values from application
--   code (submitReview writes trips.organizer_id, which is an organizers.id). The FK,
--   however, referenced auth.users(id), so every insert failed with a 23503 FK
--   violation and review submission has never succeeded end to end. Every reader and
--   comparer of this column expects organizers.id (repo audit 2026-07-18, unanimous).
--
-- Change:
--   Re-point the FK to organizers(id).
--
-- ON DELETE SET NULL rationale:
--   ON DELETE SET NULL is chosen deliberately. The column is already nullable, and
--   retaining review rows when an organizer is deleted preserves optionality for the
--   pending legal ruling on data retention (a retained row can be deleted later; a
--   cascaded row cannot be restored).
--
-- Safety:
--   Table verified empty at migration time, so there is no backfill and no validation
--   risk.

ALTER TABLE public.reviews DROP CONSTRAINT reviews_organizer_id_fkey;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE SET NULL;
