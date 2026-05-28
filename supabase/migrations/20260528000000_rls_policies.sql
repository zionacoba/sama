-- RLS Policies for Sama
-- These policies were originally configured in the Supabase dashboard and are documented here for version control.
-- Do NOT run this migration on the live database — policies already exist there.
-- This file exists solely for documentation and reproducibility purposes.

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
TO public
USING (true);

CREATE POLICY "Anyone can insert bookings"
ON public.bookings FOR INSERT
TO public
WITH CHECK (true);

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

CREATE POLICY "Reviews are publicly readable"
ON public.reviews FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can write reviews"
ON public.reviews FOR INSERT
TO authenticated
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
