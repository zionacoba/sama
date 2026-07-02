-- Add DB-level CHECK constraints backstopping money and slot invariants.
--
-- WHY:
-- The Scope A DB audit found no database-level guarantees against negative
-- money amounts, insane payouts, out-of-range slot counts, or out-of-bounds
-- commission rates. Those invariants were only enforced in application code,
-- so a bug or a direct write could leave the database holding negative
-- amounts, a payout paying out more than it took in, remaining_slots outside
-- [0, total_slots], or a commission rate outside the allowed range.
--
-- This migration documents six CHECK constraints ALREADY APPLIED MANUALLY to
-- production on 2026-07-01 via the Supabase SQL Editor (per the repo
-- convention that migrations under supabase/migrations are applied by hand,
-- not by an automated runner). All existing rows were verified to satisfy
-- these constraints before they were added; the audit confirmed 0 violations
-- across bookings, refunds, organizer_deductions, payouts, trips, and
-- organizers. It is recorded here so the repo matches the hardened live
-- state and a full `db reset` reproduces it.
--
-- WHAT IT DOES:
--   - bookings_amounts_nonneg: total_amount, amount_due, platform_commission
--     on bookings must all be >= 0.
--   - refunds_amount_nonneg: amount on refunds must be >= 0.
--   - deductions_amount_nonneg: amount on organizer_deductions must be >= 0.
--   - payouts_amounts_sane: total_amount, platform_commission, net_amount on
--     payouts must all be >= 0, and net_amount cannot exceed total_amount.
--   - trips_remaining_slots_sane: remaining_slots on trips must be >= 0 and
--     cannot exceed total_slots.
--   - organizers_commission_rate_bounds: commission_rate on organizers must
--     be between 0 and 0.20 inclusive.
--
-- The drop-if-exists + add form is safe to replay on a fresh db reset.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_amounts_nonneg;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_amounts_nonneg
  CHECK (total_amount >= 0 AND amount_due >= 0 AND platform_commission >= 0);

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_amount_nonneg;
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_amount_nonneg
  CHECK (amount >= 0);

ALTER TABLE public.organizer_deductions DROP CONSTRAINT IF EXISTS deductions_amount_nonneg;
ALTER TABLE public.organizer_deductions
  ADD CONSTRAINT deductions_amount_nonneg
  CHECK (amount >= 0);

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_amounts_sane;
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_amounts_sane
  CHECK (total_amount >= 0 AND platform_commission >= 0 AND net_amount >= 0 AND net_amount <= total_amount);

ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_remaining_slots_sane;
ALTER TABLE public.trips
  ADD CONSTRAINT trips_remaining_slots_sane
  CHECK (remaining_slots >= 0 AND remaining_slots <= total_slots);

ALTER TABLE public.organizers DROP CONSTRAINT IF EXISTS organizers_commission_rate_bounds;
ALTER TABLE public.organizers
  ADD CONSTRAINT organizers_commission_rate_bounds
  CHECK (commission_rate >= 0 AND commission_rate <= 0.20);
