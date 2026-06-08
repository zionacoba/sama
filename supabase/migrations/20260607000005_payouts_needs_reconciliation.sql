ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false;
