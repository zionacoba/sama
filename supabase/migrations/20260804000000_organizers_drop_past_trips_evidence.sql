-- Drop the retired past_trips_evidence column from organizers.
-- Intake removed at 9e5e6f8; admin select removed at 5df9871; all rows null.
alter table public.organizers drop column past_trips_evidence;
