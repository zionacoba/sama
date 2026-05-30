-- Track the PayMongo link ID created for online balance payments.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_payment_id text;

-- Track whether the balance payment link has been fulfilled via webhook.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_payment_gateway_status text;
