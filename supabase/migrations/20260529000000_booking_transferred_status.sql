-- Add column to record the email of the person receiving the slot transfer.
-- Null when no email was provided or for non-transferred bookings.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transferred_to_email text;

-- Valid booking status values:
--   confirmed       - organizer approved, slot is held
--   pending         - awaiting organizer approval (Advanced trips)
--   payment_pending - booking created, awaiting payment
--   rejected        - organizer rejected the booking request
--   cancelled       - participant cancelled
--   transferred     - organizer marked slot as transferred to another person;
--                     no refund is processed through Sama
