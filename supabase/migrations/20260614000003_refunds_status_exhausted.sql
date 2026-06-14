-- Add 'exhausted' to the refunds status CHECK constraint (resilience fix H2a).
-- A refund that fails MAX_ATTEMPTS times in retry-failed-refunds now lands in a
-- final 'exhausted' state instead of dropping silently out of the retry select.
-- 'exhausted' rows are queryable for reconciliation, excluded from future
-- retries, and trigger an admin alert at the boundary.
--
-- This constraint change was already applied live; this migration documents it
-- and keeps the repo in sync. The drop-if-exists + add form is safe to replay.

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;

ALTER TABLE refunds ADD CONSTRAINT refunds_status_check
  CHECK (status IN ('owed', 'processing', 'done', 'failed', 'manual', 'exhausted'));
