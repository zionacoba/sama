-- Constrain payment gateway status columns to valid values.
-- Prevents authenticated users from setting arbitrary values via the REST API,
-- which would bypass webhook idempotency guards.

ALTER TABLE public.bookings
  ADD CONSTRAINT payment_gateway_status_check
  CHECK (payment_gateway_status IN ('paid') OR payment_gateway_status IS NULL);

ALTER TABLE public.bookings
  ADD CONSTRAINT balance_payment_gateway_status_check
  CHECK (balance_payment_gateway_status IN ('paid') OR balance_payment_gateway_status IS NULL);
