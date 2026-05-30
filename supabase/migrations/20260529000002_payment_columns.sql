-- NOTE: These columns already exist in production. This migration documents them for version control only.
-- They were created as part of the initial schema applied directly to the live database before
-- migration tracking began. Running this file on a fresh database will add them correctly.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_gateway_status text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method text;
