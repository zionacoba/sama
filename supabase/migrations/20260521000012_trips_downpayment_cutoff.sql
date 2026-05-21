ALTER TABLE trips ADD COLUMN IF NOT EXISTS downpayment_cutoff_days integer DEFAULT 10;
