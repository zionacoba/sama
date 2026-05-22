ALTER TABLE organizers ADD COLUMN IF NOT EXISTS is_founding_partner boolean NOT NULL DEFAULT false;
