CREATE TABLE public.trip_slug_redirects (
  old_slug text PRIMARY KEY,
  new_slug text NOT NULL,
  trip_id bigint NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
