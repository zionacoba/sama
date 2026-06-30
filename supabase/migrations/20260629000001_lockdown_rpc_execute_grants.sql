-- Lock app RPCs to service_role only; remove the default PUBLIC execute grant.
--
-- WHY:
-- New Postgres functions are granted EXECUTE to PUBLIC by default, and Supabase
-- PostgREST exposes that as callable RPC for the anon/authenticated roles. That
-- let a logged-in user invoke payout and slot functions directly
-- (rpc/create_payout_atomic, rpc/restore_slot, etc.), bypassing the in-code
-- authorization in the server actions. create_payout_atomic is SECURITY DEFINER,
-- so a direct call ran as the function owner and bypassed RLS entirely — a money
-- and capacity-integrity risk.
--
-- This migration documents a change ALREADY APPLIED MANUALLY to production on
-- 2026-06-29 via the Supabase SQL Editor (per the repo convention that
-- migrations under supabase/migrations are applied by hand, not by an automated
-- runner). It is recorded here so the repo matches the hardened live state and a
-- full `db reset` reproduces it.
--
-- WHAT IT DOES:
--   - Revokes the default PUBLIC/anon/authenticated EXECUTE from four
--     security-sensitive RPCs and grants EXECUTE to service_role only:
--       create_payout_atomic, restore_slot, cancel_and_restore_slot,
--       book_slot_and_create_booking
--   - Pins search_path = public on create_payout_atomic, the one SECURITY
--     DEFINER function that was still missing it.
--
-- Idempotent and safe to re-run: REVOKE/GRANT are idempotent, the loop only
-- touches functions that exist, and ALTER FUNCTION ... SET search_path is
-- idempotent.

-- Lock app RPCs to service_role only; remove the default PUBLIC execute.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_payout_atomic',
        'restore_slot',
        'cancel_and_restore_slot',
        'book_slot_and_create_booking'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn.sig);
  END LOOP;
END $$;

-- Pin search_path on the one SECURITY DEFINER function still missing it.
ALTER FUNCTION public.create_payout_atomic(uuid, bigint[], numeric, numeric, numeric)
  SET search_path = public;
