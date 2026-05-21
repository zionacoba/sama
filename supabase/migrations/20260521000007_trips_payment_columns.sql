ALTER TABLE trips ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'full';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS min_downpayment numeric(10,2);
