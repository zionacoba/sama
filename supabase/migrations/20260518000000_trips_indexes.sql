-- Indexes on trips for the primary filter and sort columns used by the browse page.

-- Standalone column indexes (used when filtering by a single dimension)
CREATE INDEX IF NOT EXISTS trips_date_start_idx    ON trips (date_start);
CREATE INDEX IF NOT EXISTS trips_activity_type_idx ON trips (activity_type);
CREATE INDEX IF NOT EXISTS trips_difficulty_idx    ON trips (difficulty);
CREATE INDEX IF NOT EXISTS trips_destination_idx   ON trips (destination);

-- Compound index covering the most common query:
--   WHERE status = 'active' AND date_start > now()
--   ORDER BY date_start ASC/DESC
-- The status column leads so the planner can filter active rows first,
-- then use the ordered date_start for the range + sort in one scan.
CREATE INDEX IF NOT EXISTS trips_status_date_start_idx ON trips (status, date_start);

-- Partial index for the same pattern — smaller and faster when the planner
-- knows it only needs active rows (eliminates the status predicate entirely).
CREATE INDEX IF NOT EXISTS trips_active_date_start_idx ON trips (date_start)
  WHERE status = 'active';
