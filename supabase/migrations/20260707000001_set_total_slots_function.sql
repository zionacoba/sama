-- Adds set_total_slots: an atomic capacity-change RPC for updateTrip.
--
-- WHY:
-- updateTrip lets an organizer change a trip's total_slots. remaining_slots
-- must be adjusted to match, but remaining_slots is maintained incrementally
-- and atomically by the slot RPC machinery (book_slot decrement, restore_slot /
-- cancel_and_restore_slot restore). updateTrip previously recomputed
-- remaining_slots in JavaScript as max(0, new_total - consumedSlots), where
-- consumedSlots came from a bookings query taken earlier in the request. That
-- snapshot is stale by the time the write lands: a booking (decrement) or a
-- cancel (restore) committing in the window between the query and the write was
-- clobbered by the write, causing oversell or a capacity leak. supabase-js
-- .update() cannot express a column-referencing arithmetic assignment
-- (remaining_slots = remaining_slots + delta), so the race-safe adjustment has
-- to live in an RPC, exactly like every other slot-arithmetic write in this
-- codebase (book_slot, restore_slot, cancel_and_restore_slot).
--
-- DELTA SEMANTICS:
-- The single UPDATE sets total_slots = p_new_total and, in the same statement,
-- remaining_slots = greatest(0, remaining_slots + (p_new_total - total_slots)).
-- In Postgres every SET right-hand-side expression is evaluated against the OLD
-- (pre-update) row, and the SET assignments do not see each other's new values.
-- So both remaining_slots and total_slots on the RHS are the LIVE old values at
-- write time: remaining_slots already reflects every committed decrement and
-- restore, and total_slots is the real old capacity. The delta therefore equals
-- new_total - live_consumed (since live_remaining = old_total - live_consumed),
-- computed against live consumption rather than a stale snapshot. This is
-- race-safe against concurrent bookings, concurrent cancels, and even a
-- concurrent total_slots edit, because it never reads a JS-captured value.
--
-- CHECK CONSTRAINT:
-- trips_remaining_slots_sane (20260701000002_money_slot_check_constraints.sql)
-- enforces remaining_slots >= 0 AND remaining_slots <= total_slots against the
-- final row. This function satisfies both bounds by construction: greatest(0,
-- ...) guarantees the lower bound, and assigning total_slots = p_new_total in
-- the SAME statement means the upper bound is checked against the new capacity,
-- where new_remaining = new_total - live_consumed <= new_total because
-- live_consumed >= 0.
--
-- RETURNS:
-- Returns the resulting remaining_slots (not void) so the caller and the
-- verification harness can observe the adjusted value without a second read.
--
-- LOCKDOWN:
-- New Postgres functions are granted EXECUTE to PUBLIC by default, which
-- PostgREST exposes as a callable RPC for anon/authenticated. This migration
-- revokes that default and grants EXECUTE to service_role only, inline below,
-- so the function is locked down immediately on application. set_total_slots
-- must ALSO be added to the proname IN (...) list in any future re-run of
-- 20260629000001_lockdown_rpc_execute_grants.sql so a full db reset reproduces
-- the locked-down state.
--
-- This migration documents a change applied by hand in the Supabase SQL editor
-- (per the repo convention that migrations under supabase/migrations are applied
-- manually, not by an automated runner). The create-or-replace + revoke/grant
-- form is idempotent and safe to replay on a fresh db reset.

create or replace function set_total_slots(p_trip_id bigint, p_new_total integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_remaining integer;
begin
  update trips
  set total_slots = p_new_total,
      remaining_slots = greatest(0, remaining_slots + (p_new_total - total_slots))
  where id = p_trip_id
  returning remaining_slots into v_new_remaining;
  return v_new_remaining;
end;
$$;

revoke execute on function set_total_slots(bigint, integer) from public, anon, authenticated;
grant execute on function set_total_slots(bigint, integer) to service_role;
