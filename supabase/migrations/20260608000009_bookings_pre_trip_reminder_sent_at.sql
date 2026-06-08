ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_trip_reminder_sent_at timestamptz;
