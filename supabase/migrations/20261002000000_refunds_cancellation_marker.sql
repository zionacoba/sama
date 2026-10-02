-- Add a per-cancellation marker to refunds (CP-v120).
--
-- WHY: refunds_one_settled and issueAndRecordRefund's settled-row check were keyed
-- on (booking_id, source, payment_id) alone. After one refund on a payment, any
-- later refund on that same payment was skipped and reported as processed: a
-- partial cancel followed by another partial cancel, a full cancel, a trip
-- cancellation or an organizer rejection. The marker says WHICH cancellation a
-- refund belongs to, so a second, different refund is no longer a "duplicate".
--
-- VALUES:
--   0     = the refund that ends a booking (booking reject, full cancel, trip
--           cancellation, organizer rejection, and manual rows written when a
--           payment arrives on a cancelled booking). Every existing row is one
--           of these, so the default is also the correct value for them.
--   n > 0 = a partial cancel; n is the booking's slot count BEFORE that cancel.
--           A booking's slots only ever go down after creation, and the partial
--           cancel's update is guarded on that count, so each partial cancel has
--           its own value and a retry of the same cancel repeats it.
--
-- NOT NULL DEFAULT 0: a writer that passes no marker gets 0 and behaves exactly
-- as before (the second refund is skipped), so a missing marker can never pay
-- twice. A nullable marker would be exempt from the unique index (Postgres treats
-- NULLs as distinct), which is the failure this avoids.
--
-- THE INDEX: same predicate as before (processing, done, owed); only the key
-- gains the marker. The new index is created FIRST under a temporary name, then
-- the old one is dropped and the new one renamed, so the table is never without
-- a guard. While both exist, the old, narrower index behaves exactly as today.

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS cancellation_marker integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX refunds_one_settled_new ON public.refunds USING btree (booking_id, source, payment_id, cancellation_marker) WHERE (status = ANY (ARRAY['processing'::text, 'done'::text, 'owed'::text]));

DROP INDEX public.refunds_one_settled;

ALTER INDEX public.refunds_one_settled_new RENAME TO refunds_one_settled;
