ALTER TABLE public.profiles
ADD CONSTRAINT profiles_facebook_url_check
CHECK (
  facebook_url IS NULL OR
  facebook_url = '' OR
  facebook_url LIKE 'https://facebook.com/%' OR
  facebook_url LIKE 'https://www.facebook.com/%' OR
  facebook_url LIKE 'https://m.facebook.com/%'
);
