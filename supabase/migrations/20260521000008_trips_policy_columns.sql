ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancellation_policy text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancellation_policy_custom text;
