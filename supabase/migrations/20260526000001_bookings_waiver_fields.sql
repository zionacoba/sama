ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_text_snapshot text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_ip text;
