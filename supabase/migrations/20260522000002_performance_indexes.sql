CREATE INDEX IF NOT EXISTS idx_bookings_trip_id
  ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
  ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_organizer_id
  ON trips(organizer_id);
CREATE INDEX IF NOT EXISTS idx_trips_status_date
  ON trips(status, date_start);
CREATE INDEX IF NOT EXISTS idx_organizers_user_id
  ON organizers(user_id);
