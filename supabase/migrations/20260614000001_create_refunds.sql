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
  booking_id bigint NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS refunds_settled_unique
  ON refunds (booking_id, source, payment_id)
  WHERE status IN ('processing', 'done');

-- Retry cron scans owed/failed rows.
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status);

-- Deny-by-default: no policies. All access goes through the service-role client.
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
