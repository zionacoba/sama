-- Drop the stale text[] overload of book_slot_and_create_booking.
--
-- Migration 20260603000001 created book_slot_and_create_booking with
-- p_participants declared as text[]. Migration 20260610000005 later added a
-- jsonb version, but because the parameter type changed, CREATE OR REPLACE
-- created a separate overload instead of replacing the original, leaving two
-- functions with the same name. On prod the text[] overload was hand-dropped
-- and that drop was never captured as a migration, so any from-scratch rebuild
-- of the schema resurrects a stale overload that prod does not have, creating
-- call-ambiguity risk. This migration captures the drop: it no-ops on prod
-- (the function is already gone) and converges rebuilds on prod's
-- single-overload state.

drop function if exists "public"."book_slot_and_create_booking"(p_trip_id bigint, p_user_id uuid, p_slots_requested integer, p_full_name text, p_email text, p_phone text, p_total_amount numeric, p_status text, p_notes text, p_payment_option text, p_amount_due numeric, p_participants text[], p_emergency_contact_name text, p_emergency_contact_phone text, p_waiver_agreed boolean, p_waiver_agreed_at timestamp with time zone, p_platform_waiver_agreed boolean, p_medical_notes text, p_meeting_point text, p_platform_commission numeric, p_commission_rate_used numeric, p_waiver_text_snapshot text, p_waiver_ip text, p_platform_waiver_snapshot text);
