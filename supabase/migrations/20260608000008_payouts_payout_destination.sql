ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS payout_destination jsonb;
