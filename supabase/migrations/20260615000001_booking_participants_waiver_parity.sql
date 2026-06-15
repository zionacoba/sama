-- Give booking_participants waiver parity with the bookings row: a per-participant
-- waiver text snapshot and the IP captured at acceptance time. Both columns were
-- already applied live; this migration records them for repo/reset parity.
ALTER TABLE public.booking_participants
ADD COLUMN IF NOT EXISTS waiver_text_snapshot text,
ADD COLUMN IF NOT EXISTS waiver_ip text;
