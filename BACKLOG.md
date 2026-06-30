# Sama Backlog

Last updated: June 30, 2026. Living document; update as items close.

## DONE (recently shipped and verified)
- Organizer mobile audit: photo uploader touch controls, dashboard header/tabs/earnings tables, by-pickup and waitlist card views, touch targets, modal scroll caps, date-filter wrap, trip-price spacing.
- Security audit: RPC execute-grant lockdown (verified live), saveFacebookUrl IDOR removed, security headers added (CSP in report-only), CSV formula-injection fix, storage buckets confirmed scoped.
- CRON_SECRET rotation (all 7 secret-carrying jobs + edge function secret; verified). Fixed a job-15 placeholder bug in the same pass.
- RA 10173: 90-day medical-data retention purge (edge function built, deployed, tested end to end, scheduled daily). Privacy policy updated to disclose it; retention figures aligned to 10 years; Terms cross-references privacy policy.
- Live-mode PayMongo webhook signature fix (caught via dry run; was only verifying test-mode signature). Regression-audited.
- Refund-tier verification: Terms Flexible/Moderate/Strict match booking.ts exactly.
- LIVE PAYMENTS PROVEN: GCash and QR Ph both completed real end-to-end live bookings (webhook-confirmed, commission correct, emails sent). Live keys, live webhook endpoint, and PAYMONGO_WEBHOOK_SECRET all set in production.

## LAUNCH GATES (before opening to real organizers/customers)
- Full manual test pass using the 3 printable scripts (organizer / joiner / run-map). Stated major pre-beta activity.
- A-plus transfer live end-to-end test (book single-slot -> transfer -> complete /join -> verify completed:true, has_ip, has_snapshot everywhere).
- Organizer-audit M1: paid-but-unapproved Advanced bookings can get stuck after the trip date with no auto-resolution. Investigation queued, not run.
- Legal review of Terms, waiver, organizer agreement, and privacy policy (longest lead time). Have reviewer also: add a brief Custom cancellation policy note to Terms Section 6; confirm 10-year retention figure; cross-check Terms/Refund pages for stray figures; confirm NPC registration obligation vs sworn declaration + DPO for health data.
- Flip CSP from report-only to enforce after a clean violation report from a real production booking.
- Before public launch: link /apply from /organizers (intentionally absent now).
- Decision: keep demo trips (serving PayMongo review) vs re-wipe before real beta.

## PAYMENTS / POST-LAUNCH PaymENT WORK
- Migrate PayMongo checkout from Links API to Checkout Sessions API. Fixes the post-payment redirect (Links does not reliably auto-redirect to /payment/success; customer lands on PayMongo receipt) AND moves payment-method control into code. Touches create-payment-link.ts, the link-id reads in booking.ts and confirm-paid-booking.ts, and the webhook event shape. Own session + full regression audit. Plan for any in-flight Links.
- Quick polish (no code): brand the PayMongo receipt page in the dashboard (logo/colors); add a post-payment expectation note in the booking flow ("you'll get a confirmation email; view your booking in your profile").
- Note: payment methods are dashboard-controlled (Links API). Card disabled by PayMongo support; only GCash + QR Ph enabled. There is no payment-method list in code.

## SECURITY / RELIABILITY FAST-FOLLOWS
- Email send reliability: confirmation emails are tied to the one-time paid transition with no sent-flag and no retry; if a confirming run's emails fail, no path retries and there's no way to detect it. Add a sent flag + retry path.
- Organizer notification email: organizers.email is written once at signup and never updated; org profile editor has no email field. Add an email field to the organizer profile editor (or re-sync on account email change) so organizers control their notification address.
- Add unit tests for the webhook verifySignature (valid te=, valid li=, both-empty rejects, wrong-length rejects, stale-timestamp rejects). Currently untested; this is the money-confirmation gate.
- Timestamp hardening in webhook: non-numeric t= makes the replay check NaN>300 = false (skipped). Pre-existing, not exploitable (HMAC over literal timestamp), low priority.
- L1: return generic error messages instead of raw DB errors (info disclosure).
- L2: rate limiting on review submission, waitlist joins, and payment-link creation.
- L3: npm audit fix for moderate transitive advisories (postcss, opentelemetry).
- Storage: enforce MIME/size limits on the trip-photos and organizer-photos bucket insert policies (currently client-side only).
- Optional: explicit .limit on the participant side of the medical-purge job (scale only).
- Consider one final CRON_SECRET and PAYMONGO_WEBHOOK_SECRET rotation post-launch, storing values only in the password manager (both passed through chat during setup).
- User-facing data export feature to back the access/portability promise (currently fulfilled manually within 15 business days).

## DEFERRED TECHNICAL (own focused sessions)
- DISCOUNT CODE SYSTEM: spec'd (Sama_Discount_System_Design.md), build post-launch. Organizer absorbs discount; platform commission stays 5% of original; max-discount cap (proposed 50%). Touches commission/downpayment/refund; needs full regression audit after building. Open decisions: cap value; downpayment rule; fixed-code-exceeds-price handling; globally-unique vs per-organizer codes; platform-funded codes (v2); no stacking in v1.
- Full database-types client wiring (~244 errors) to catch RPC-signature drift at compile time. Note stale restore_slot param name in database.types.ts (cosmetic, harmless).

## DEFERRED AUDIT POLISH (post-launch)
- Reviews: add DB unique constraint on (user_id, trip_id); delete dead app/trips/[slug]/review-form.tsx; extra scrutiny on free-trip reviews.
- Organizer audit: M2 (gross/commission clarity copy), M3 (pending-earnings query scoping), L1-L5. Extract shared organizer BookingCard (by-pickup cards duplicate row markup inline).
- Joiner audit: L1-L5; fullRefundable uses trip.cancellation_policy vs server booking.cancellation_policy ?? trip.
- Align createTrip/updateTrip past-date check to Manila timezone (booking/cancel/transfer/publish already Manila).
- Public /organizers page: claim-by-claim accuracy pass before public launch.
- Personalize refund timing by payment method (GCash auto/fast vs QR Ph manual); add refund timing to the partial-cancel modal.
- Photo-uploader: confirm touch controls render correctly on a real phone (never device-verified); optional one-tap "Set as cover".

## FEATURE FOLLOW-UPS (designed, deferrable)
- A-plus multi-slot transfer (v1 is single-slot only).
- Widen the pre-trip-reminder cron to chase incomplete transfer-replacements.

## NEAR-TERM (during wait / pre-beta)
- Populate Sama IG/TikTok/FB business accounts with starter posts (avoid sharing empty pages with PayMongo/customers).
- Optional test-mode beta dry-run with the 2 tester organizers (doubles as a real-user test pass).

## OPTIONAL UI POLISH
- Swap the stock Unsplash hero for a real organizer/trip photo.
- Footer drift risk: each new page must include <Footer /> (it's per-page, not in the root layout); full fix is migrating the footer into the layout.
