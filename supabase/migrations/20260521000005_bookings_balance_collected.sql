ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_collected boolean NOT NULL DEFAULT false;
