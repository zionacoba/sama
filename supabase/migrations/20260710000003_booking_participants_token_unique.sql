-- Prod carries two UNIQUE constraints on booking_participants(token):
-- booking_participants_token_key and booking_participants_token_unique.
-- This is a logged, harmless quirk of the hand-applied era. The genesis
-- reconstruction could only produce one of them, because Postgres silently
-- deduplicates identical UNIQUE constraints declared inside a single
-- CREATE TABLE. This migration adds the second constraint explicitly,
-- guarded for idempotency: it skips on prod where the constraint already
-- exists and creates it on fresh rebuilds, converging on prod's shape.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_participants'::regclass
      and conname = 'booking_participants_token_unique'
  ) then
    raise notice 'constraint "booking_participants_token_unique" already exists on booking_participants, skipping';
  else
    alter table public.booking_participants
      add constraint booking_participants_token_unique unique (token);
  end if;
end
$$;
