-- Store organizer acceptance of the Sama Organizer Terms.
--
-- Four columns, all nullable with no default, because the two organizers
-- approved before this mechanism existed genuinely have not accepted and
-- an empty column is the honest record of that.
--
-- There is deliberately no boolean flag. The timestamp IS the record:
-- a date means accepted on that date, null means not accepted, and the
-- two can never contradict each other.
--
-- terms_text_snapshot stores the exact wording rendered on the form at
-- acceptance time, which is what Sections 1 and 28 of the agreement
-- promise. terms_version is the readable label for the same fact.

ALTER TABLE public.organizers
ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
ADD COLUMN IF NOT EXISTS terms_ip text,
ADD COLUMN IF NOT EXISTS terms_version text,
ADD COLUMN IF NOT EXISTS terms_text_snapshot text;
