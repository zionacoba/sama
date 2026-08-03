-- Free-text certifications and registrations supplied by the organizer at application time.
-- Private: reviewed by Sama during application review, never rendered on public surfaces.
alter table public.organizers add column certifications text;
