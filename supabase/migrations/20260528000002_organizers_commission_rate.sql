-- Per-organizer commission rate. Default 5%. Valid range enforced at application layer (1%–20%).
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS commission_rate numeric(5,4) DEFAULT 0.05;
