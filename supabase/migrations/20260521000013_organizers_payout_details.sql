ALTER TABLE organizers ADD COLUMN IF NOT EXISTS payout_method text;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS gcash_number text;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS gcash_name text;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS bank_account_name text;
