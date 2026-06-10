CREATE TABLE public.organizer_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  booking_id bigint NOT NULL REFERENCES public.bookings(id),
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  applied_payout_id uuid REFERENCES public.payouts(id),
  created_at timestamptz DEFAULT now()
);
