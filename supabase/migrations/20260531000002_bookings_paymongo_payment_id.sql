ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_paymongo_payment_id TEXT;
