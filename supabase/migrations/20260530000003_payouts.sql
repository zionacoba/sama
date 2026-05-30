CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id),
  booking_ids bigint[] NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  platform_commission numeric(10,2) NOT NULL,
  net_amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'remitted')),
  remitted_at timestamptz,
  remittance_reference text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.payouts(id);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payout_status text DEFAULT 'unpaid' CHECK (payout_status IN ('unpaid', 'included', 'remitted'));

CREATE INDEX IF NOT EXISTS idx_payouts_organizer_id ON public.payouts(organizer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payout_status ON public.bookings(payout_status);
