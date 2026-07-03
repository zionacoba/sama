-- payouts.booking_ids was created as uuid[] but stores bigint booking ids.
-- create_payout_atomic inserts bigint[] into it, which cannot cast to uuid[],
-- so payout creation has always failed and the table is empty. Correct the
-- column type to bigint[] to match booking ids and the function. Empty table,
-- no data conversion needed.
ALTER TABLE public.payouts ALTER COLUMN booking_ids TYPE bigint[];
