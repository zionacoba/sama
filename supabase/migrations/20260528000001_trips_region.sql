ALTER TABLE trips ADD COLUMN IF NOT EXISTS region text CHECK (region IN ('Luzon', 'Visayas', 'Mindanao'));
CREATE INDEX IF NOT EXISTS idx_trips_region ON trips(region);
