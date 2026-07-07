-- Extend the refunds_one_settled partial unique index to also cover 'owed'.
--
-- WHY:
-- The refunds_one_settled index is the idempotency backstop that stops the same
-- (booking_id, source, payment_id) from being refunded twice. As originally
-- created (20260614000001_create_refunds.sql) its predicate covered only
-- WHERE status IN ('processing', 'done'). That leaves a race window.
--
-- issueAndRecordRefund (lib/refunds.ts) records the obligation write-before-call:
-- it inserts a row with status 'owed' BEFORE it contacts PayMongo, then flips
-- that row to 'done' or 'failed' after the call returns. During the PayMongo
-- call window the row sits in 'owed', which the old predicate did NOT cover. So
-- two first-issue callers acting on the same (booking_id, source, payment_id) at
-- the same time could BOTH pass the pre-insert settled-row check (no 'processing'
-- or 'done' row exists yet), BOTH insert an 'owed' row (the index did not block
-- it), and BOTH go on to POST a refund to PayMongo. That is a double refund of
-- real money.
--
-- Adding 'owed' to the predicate closes the window. The 'owed' insert itself
-- becomes the atomic gate: the first inserter wins, and the second concurrent
-- inserter now violates the unique index and gets a Postgres 23505. The existing
-- code in issueAndRecordRefund already maps a 23505 on this insert to
-- { success: true } and issues no PayMongo call, so the loser simply treats the
-- obligation as already handled. Only one refund is ever POSTed.
--
-- 'failed' and 'exhausted' are deliberately still NOT covered: a failed refund
-- must be retryable by the retry-failed-refunds cron, and covering those states
-- would block the retry from ever writing the row back toward 'done'.
--
-- This is a drop and recreate of the index. Column list and structure are
-- identical to the live index (booking_id, source, payment_id); only the WHERE
-- predicate gains 'owed'. Applied by hand in the Supabase SQL editor per the
-- repo convention that migrations here are applied manually, not by an automated
-- runner; this file records that change so a full db reset reproduces it.

DROP INDEX IF EXISTS refunds_one_settled;

CREATE UNIQUE INDEX refunds_one_settled ON public.refunds USING btree (booking_id, source, payment_id) WHERE (status = ANY (ARRAY['processing'::text, 'done'::text, 'owed'::text]));
