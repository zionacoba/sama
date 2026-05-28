-- RLS Policies for Sama
-- These policies were originally configured in the Supabase dashboard and are documented here for version control.
-- Do NOT run this migration on the live database — policies already exist there.
-- This file exists solely for documentation and reproducibility purposes.
-- Last updated: 2026-05-28 — tightened booking access, removed duplicate review policies.

-- Enable RLS on all tables
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- ========================
-- BOOKINGS POLICIES
-- ========================

CREATE POLICY "Admin can view all bookings"
ON public.bookings FOR SELECT
TO authenticated
USING ((auth.jwt() ->> 'email') = 'acobapaulzion@gmail.com');

CREATE POLICY "Authenticated users can insert bookings"
ON public.bookings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Organizers can read bookings on their trips"
ON public.bookings FOR SELECT
TO authenticated
USING (
  trip_id IN (
    SELECT trips.id FROM trips
    JOIN organizers ON organizers.id = trips.organizer_id
    WHERE organizers.user_id = auth.uid()
    AND organizers.status = 'approved'
  )
);

CREATE POLICY "Organizers can update bookings on their trips"
ON public.bookings FOR UPDATE
TO authenticated
USING (
  trip_id IN (
    SELECT trips.id FROM trips
    JOIN organizers ON organizers.id = trips.organizer_id
    WHERE organizers.user_id = auth.uid()
    AND organizers.status = 'approved'
  )
)
WITH CHECK (
  trip_id IN (
    SELECT trips.id FROM trips
    JOIN organizers ON organizers.id = trips.organizer_id
    WHERE organizers.user_id = auth.uid()
    AND organizers.status = 'approved'
  )
);

-- ========================
-- ORGANIZERS POLICIES
-- ========================

CREATE POLICY "Admin can update status"
ON public.organizers FOR UPDATE
TO public
USING ((auth.jwt() ->> 'email') = 'acobapaulzion@gmail.com');

CREATE POLICY "Users can apply"
ON public.organizers FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own organizer profile"
ON public.organizers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users view own, admin views all"
ON public.organizers FOR SELECT
TO public
USING (
  (auth.uid() = user_id)
  OR ((auth.jwt() ->> 'email') = 'acobapaulzion@gmail.com')
);

-- ========================
-- PROFILES POLICIES
-- ========================

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO public
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT
TO public
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO public
USING (auth.uid() = id);

-- ========================
-- REVIEWS POLICIES
-- ========================

CREATE POLICY "Anyone can read reviews"
ON public.reviews FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated users can insert their own reviews"
ON public.reviews FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);

-- ========================
-- TRIPS POLICIES
-- ========================

CREATE POLICY "Approved organizers can create trips"
ON public.trips FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organizers
    WHERE organizers.id = trips.organizer_id
    AND organizers.user_id = auth.uid()
    AND organizers.status = 'approved'
  )
);

CREATE POLICY "Organizers can update their own trips"
ON public.trips FOR UPDATE
TO public
USING (
  organizer_id IN (
    SELECT organizers.id FROM organizers
    WHERE organizers.user_id = auth.uid()
  )
);

CREATE POLICY "Organizers can view their own trips"
ON public.trips FOR SELECT
TO public
USING (
  (organizer_id IN (
    SELECT organizers.id FROM organizers
    WHERE organizers.user_id = auth.uid()
  ))
  OR (status = 'active')
);

CREATE POLICY "Public can view active trips"
ON public.trips FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- ========================
-- BOOKING_PARTICIPANTS POLICIES
-- ========================
-- All access is handled via the service role (supabaseAdmin) in server actions.
-- booking_participants contains sensitive personal data (names, emergency contacts)
-- and must never be directly accessible by authenticated users via the anon key.
-- Explicit DENY policies enforce this even if a client-side bug uses the wrong client.

ALTER TABLE public.booking_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to booking_participants"
ON public.booking_participants FOR ALL
TO authenticated
USING (false);

-- ========================
-- WAITLIST POLICIES
-- ========================
-- All access is handled via the service role (supabaseAdmin) in server actions.
-- If direct participant access is needed in future (e.g. "leave waitlist" self-serve),
-- replace this policy with: USING (auth.uid() = user_id)

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to waitlist"
ON public.waitlist FOR ALL
TO authenticated
USING (false);
