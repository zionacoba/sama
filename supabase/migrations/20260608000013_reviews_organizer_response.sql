alter table reviews add column if not exists organizer_response text;
alter table reviews add column if not exists organizer_responded_at timestamptz;
