-- Stage 5a of the pre-trip payout build: create the organizer_credits table.
--
-- Documentation-of-record. This file is applied MANUALLY in the Supabase SQL
-- editor, not by an automated migration runner. Nothing in the application
-- reads or writes this table yet; later Stage 5 steps wire it up.
--
-- Design decision D2: credits live in a SEPARATE organizer_credits table (NOT a
-- column on organizer_deductions). This table mirrors organizer_deductions in
-- shape, RLS, and grants, with two intentional differences:
--   1. status allows 'void' (credits are voidable) in addition to
--      'pending'/'applied'; deductions only has 'pending'/'applied'.
--   2. a partial unique index on booking_id WHERE status <> 'void' guarantees a
--      booking has at most one active (pending or applied) credit, preventing
--      double-crediting.
--
-- Access model mirrors organizer_deductions exactly: ENABLE ROW LEVEL SECURITY
-- with no policies. The service role (admin client used by server actions)
-- bypasses RLS; anon and authenticated are denied at the row level. Like
-- organizer_deductions, this file adds no explicit GRANT/REVOKE statements.

CREATE TABLE public.organizer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  booking_id bigint NOT NULL REFERENCES public.bookings(id),
  amount numeric(10,2) NOT NULL CONSTRAINT credits_amount_nonneg CHECK (amount >= 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'void')),
  applied_payout_id uuid REFERENCES public.payouts(id),
  created_at timestamptz DEFAULT now()
);

-- RLS: mirror organizer_deductions. No policies -- all legitimate access uses
-- the admin client which bypasses RLS. anon/authenticated get deny-all.
ALTER TABLE public.organizer_credits ENABLE ROW LEVEL SECURITY;

-- At most one active credit per booking. Voided credits are excluded so a
-- booking can be re-credited after a prior credit is voided.
CREATE UNIQUE INDEX organizer_credits_booking_active_uniq
  ON public.organizer_credits (booking_id)
  WHERE status <> 'void';


-- ============================================================================
-- VERIFICATION QUERIES -- run these AFTER applying the migration above.
-- ============================================================================

-- (a) Confirm the table exists with the right columns / types / defaults.
--     Expect: id uuid, organizer_id uuid, booking_id bigint, amount numeric,
--     reason text, status text (default 'pending'), applied_payout_id uuid,
--     created_at timestamptz.
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'organizer_credits'
-- ORDER BY ordinal_position;

-- (b) Confirm RLS is enabled. Expect relrowsecurity = true.
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname = 'organizer_credits';

-- (c) Confirm grants are service_role-only (no anon/authenticated/public).
--     Expect: no rows for anon, authenticated, or PUBLIC. This should match
--     organizer_deductions exactly -- run the same query against it to compare.
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'organizer_credits'
-- ORDER BY grantee, privilege_type;

-- (d) Confirm the partial unique index exists (booking_id WHERE status <> 'void').
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'organizer_credits'
--   AND indexname = 'organizer_credits_booking_active_uniq';
