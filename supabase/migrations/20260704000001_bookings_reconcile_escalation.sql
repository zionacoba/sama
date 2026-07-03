-- Bound the "strand-forever" reconciliation case (Shape C: bound + escalate +
-- human decides).
--
-- WHY:
-- A payment_pending booking whose PayMongo link cannot be fetched (network
-- error, non-2xx, timeout) is left untouched by the reconcile route and re-tried
-- forever by cleanup-abandoned-payments, holding its slot indefinitely. We must
-- never auto-cancel or free the slot of a booking whose payment we could not
-- verify, so instead of resolving it we bound the retry loop: after 6 hours of
-- being unverifiable we stop retrying and fire ONE escalation alert to the admin,
-- then leave the booking payment_pending (slot still held) for the daily digest
-- to keep surfacing until a human resolves it in the PayMongo dashboard.
--
-- Two nullable timestamptz columns implement a reliable fire-exactly-once:
--   * reconcile_first_failed_at: stamped once by the reconcile route on the FIRST
--     unreachable failure (guarded so later failures never push it forward). This
--     starts the 6-hour clock. It is NOT set on the paid or definitively-unpaid
--     branches, only on the "could not verify" catch.
--   * reconcile_escalated_at: stamped once by cleanup-abandoned-payments after it
--     sends the single escalation email. cleanup excludes rows where this is
--     non-null from its retry selection, so the alert fires exactly once and the
--     row stops being retried. Neither column is a payment-state column, so
--     nothing irreversible happens to the booking automatically.
--
-- No separate grant is required: column privileges inherit from the table, and
-- service_role already holds SELECT/INSERT/UPDATE/DELETE on public.bookings (left
-- intact by 20260614000006_lock_down_bookings_direct_writes.sql; described as the
-- baseline set in 20260703000002_grant_service_role_manual_tables.sql). Both the
-- reconcile route and cleanup write via the service_role admin client.
--
-- Idempotent and safe to replay: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reconcile_first_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconcile_escalated_at    timestamptz;

COMMENT ON COLUMN public.bookings.reconcile_first_failed_at IS
  'When PayMongo first became unreachable for this payment_pending booking during reconciliation. Starts the 6h strand-escalation clock. Not set on paid/unpaid outcomes.';
COMMENT ON COLUMN public.bookings.reconcile_escalated_at IS
  'When cleanup-abandoned-payments fired the one-time admin escalation for a booking unverifiable for over 6h. Non-null excludes the row from further reconcile retries; the booking stays payment_pending with its slot held until a human resolves it.';
