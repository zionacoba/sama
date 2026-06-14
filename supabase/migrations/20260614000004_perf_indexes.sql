-- Performance indexes for cron driving selects and admin/review/finance lookups.
-- These were already applied live via the SQL editor; this migration keeps the
-- repo migration history in sync. Plain CREATE INDEX IF NOT EXISTS (not
-- CONCURRENTLY) so it stays replay-safe inside a transaction.

create index if not exists idx_bookings_stuck_pending on bookings (created_at) where status = 'payment_pending' and payment_gateway_status is null;
create index if not exists idx_bookings_unconfirmed_balance on bookings (created_at) where status = 'confirmed' and balance_payment_id is not null and balance_payment_gateway_status is null;
create index if not exists idx_bookings_pending_unreminded on bookings (created_at) where status = 'pending' and reminder_sent_at is null;
create index if not exists idx_bookings_pretrip_unsent on bookings (trip_id) where status = 'confirmed' and pre_trip_reminder_sent_at is null;
create index if not exists idx_reviews_org_approved_created on reviews (organizer_id, approved, created_at desc);
create index if not exists idx_reviews_approved on reviews (approved) where approved = false;
create index if not exists idx_reviews_booking_id on reviews (booking_id);
create index if not exists idx_deductions_org_status on organizer_deductions (organizer_id, status);
create index if not exists idx_refunds_booking_id on refunds (booking_id);
create index if not exists idx_payouts_status on payouts (status);
