DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE display_name IS NOT NULL
    GROUP BY lower(display_name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate display names exist — resolve them before creating the unique index.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS organizers_display_name_unique
  ON public.organizers (lower(display_name))
  WHERE display_name IS NOT NULL;
