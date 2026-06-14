-- Durable refund records (resilience fix F1).
-- Every refund obligation is written here BEFORE PayMongo is contacted, so a
-- failed refund or missed admin email can never silently leave a customer
-- un-refunded with no system trace. The retry-failed-refunds edge function
-- reconciles/retries owed and failed rows.
--
-- This table may already exist in some environments; the guards below make this
-- migration idempotent and safe to apply on top of the live schema.

CREATE TABLE IF NOT EXISTS refunds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES bookings(id),
  source text NOT NULL CHECK (source IN ('downpayment', 'balance')),
  payment_id text,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'owed'
    CHECK (status IN ('owed', 'processing', 'done', 'failed', 'manual')),
  paymongo_refund_id text,
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Idempotency backstop: at most one settled/in-flight refund per
-- (booking, source, payment). Owed/failed rows are intentionally excluded so a
-- retry can keep working a row until it settles.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_one_settled
  ON refunds (booking_id, source, payment_id)
  WHERE status IN ('processing', 'done');

-- Retry cron scans owed/failed rows.
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status);

-- Deny-by-default: no policies. All access goes through the service-role client.
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Table-level grants. service_role bypasses RLS but still needs table
-- privileges; without these the retry edge function fails with
-- "permission denied for table refunds". anon/authenticated are intentionally
-- left with no access so the table stays locked to direct PostgREST traffic.
-- GRANT is idempotent, so this stays safe to replay.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE refunds TO service_role;
