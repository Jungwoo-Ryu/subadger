-- Meeting backlog: listing title & filters, profile extensions, super likes, feed stack, chat images.
-- Profiles/listings columns above also exist on fresh DBs (see 20260320 CREATE TABLE); ALTERs here stay
-- idempotent (IF NOT EXISTS) for projects created before that merge.

-- -----------------------------------------------------------------------------
-- listings
-- -----------------------------------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

UPDATE public.listings
SET title = left(btrim(address), 120)
WHERE btrim(COALESCE(title, '')) = '';

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS amenities JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS utilities_included BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rule_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_email TEXT,
  ADD COLUMN IF NOT EXISTS school_email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grade_or_year TEXT,
  ADD COLUMN IF NOT EXISTS affiliation TEXT,
  ADD COLUMN IF NOT EXISTS roommate_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- messages — optional image; body may be empty when image is set
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN body SET DEFAULT '';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_url TEXT;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'messages'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%body%'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_or_image_ok CHECK (
    (length(trim(COALESCE(body, ''))) > 0)
    OR (image_url IS NOT NULL AND length(trim(image_url)) > 0)
  );

-- -----------------------------------------------------------------------------
-- super_likes — offer / question; one per sender per UTC day
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT super_likes_no_self CHECK (sender_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_super_likes_one_per_sender_day
  ON public.super_likes (sender_id, ((created_at AT TIME ZONE 'UTC')::date));

CREATE INDEX IF NOT EXISTS idx_super_likes_recipient ON public.super_likes (recipient_id);

-- -----------------------------------------------------------------------------
-- feed_session_stack — server-side “back” stack (UUID array, end = top)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_session_stack (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  listing_ids UUID[] NOT NULL DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.super_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_likes_select" ON public.super_likes;
CREATE POLICY "super_likes_select"
  ON public.super_likes FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "super_likes_insert" ON public.super_likes;
CREATE POLICY "super_likes_insert"
  ON public.super_likes FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

ALTER TABLE public.feed_session_stack ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_session_stack_own" ON public.feed_session_stack;
CREATE POLICY "feed_session_stack_own"
  ON public.feed_session_stack FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
