-- Store the commission rate that was actually applied at booking time.
-- Needed for accurate payout reconciliation if the organizer rate changes later.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_rate_used numeric(5,4);
