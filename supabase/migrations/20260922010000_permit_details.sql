-- Permit details: per-trip opt-in, collected per participant, purged 90 days after the trip.
alter table public.trips
  add column requires_permit_details boolean not null default false;

alter table public.booking_participants
  add column age smallint,
  add column sex text,
  add column home_address text,
  add column phone text,
  add constraint booking_participants_sex_check
    check (sex is null or sex in ('male', 'female'));
