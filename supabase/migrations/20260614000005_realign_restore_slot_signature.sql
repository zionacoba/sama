-- Realigns the live restore_slot function back to the repo signature.
--
-- The live function had drifted out-of-band: it was recreated in the database
-- with a parameter named p_slots_to_restore, while every one of the 9 code call
-- sites and the original migration (20260521000000_restore_slot_function.sql)
-- pass p_slots_requested. PostgREST resolves RPCs by exact named-parameter
-- signature, so every restore_slot call returned 404 / PGRST202 in production.
-- The result was a silent capacity leak: cancellations, rejections, partial
-- cancellations, and failed-booking rollbacks never returned their slots to the
-- trip (markAsTransferred was the only loud symptom, since it checks the error
-- and emails the admin on failure).
--
-- The live fix has already been applied (the function was recreated with the
-- p_slots_requested signature). This migration is a belt-and-suspenders
-- realignment: it drops the drifted p_slots_to_restore signature and recreates
-- the correct one, so a db reset reproduces the working version and the repo
-- matches live. The original migration already defines p_slots_requested; this
-- intentionally restates it and removes the drifted signature. Do not edit the
-- original migration.

drop function if exists restore_slot(p_trip_id bigint, p_slots_to_restore integer);

create or replace function restore_slot(p_trip_id bigint, p_slots_requested integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update trips
  set remaining_slots = least(total_slots, remaining_slots + p_slots_requested)
  where id = p_trip_id;
end;
$$;

grant execute on function restore_slot(bigint, integer) to service_role;
