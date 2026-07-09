-- Genesis straggler indexes: the two bookings payment-column indexes.
--
-- These two indexes exist in prod_schema_dump.sql but are created by no migration.
-- They logically belong to the genesis baseline (20260517000000_genesis_tables.sql),
-- but they cannot live there: each indexes a column that does not exist yet at the
-- genesis timestamp. payment_id is added later by 20260529000002 and
-- balance_payment_id by 20260530000001, so placing these CREATE INDEX statements in
-- the genesis file would fail with "column does not exist" and abort a from-scratch
-- db reset. This trailing migration runs after both columns exist, closing the gap.
--
-- Both use IF NOT EXISTS so a db push against prod (where both indexes already exist)
-- is a no-op. Definitions are copied verbatim from prod_schema_dump.sql.

CREATE INDEX IF NOT EXISTS idx_bookings_payment_id ON public.bookings USING btree (payment_id);

CREATE INDEX IF NOT EXISTS idx_bookings_balance_payment_id ON public.bookings USING btree (balance_payment_id);
