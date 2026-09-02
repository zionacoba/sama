-- Free-text business registration and business address supplied by the organizer at application time.
-- business_registration records what business registration the organizer holds (BIR, DTI, SEC, or DOT
-- accreditation), collected because RR 16-2023 and RA 11967 require the platform to identify its merchants.
-- business_address records the organizer's geographic business address, per RA 11967 section 21(b).
-- Both are private: reviewed by Sama during application review, never rendered on public surfaces.
-- Neither is gated or enforced at this stage — they are stored only.
alter table public.organizers add column business_registration text;
alter table public.organizers add column business_address text;
