-- Create public.profiles automatically when a new auth.users row is inserted.
-- Prevents GET /v1/profiles/me 404 for new sign-ups. Apply with: supabase db push

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
  dn text;
BEGIN
  r := COALESCE(NEW.raw_user_meta_data ->> 'role', 'seeker');
  IF r IN ('host', 'owner') THEN
    r := 'host';
  ELSE
    r := 'seeker';
  END IF;

  dn := NULLIF(
    TRIM(
      COALESCE(
        NEW.raw_user_meta_data ->> 'name',
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'display_name',
        ''
      )
    ),
    ''
  );
  IF dn IS NULL THEN
    dn := COALESCE(NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''), 'Member');
  END IF;

  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    r,
    dn
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
