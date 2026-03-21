-- Roomie / Subadger — DB schema v1 (Supabase Postgres)
-- Aligns with docs/LLM_CONTEXT_PRODUCT_SPEC.md
-- Requires: auth.users (Supabase Auth). Run via `supabase db push` or app startup ensure_schema().

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles — extends auth.users (Seeker OR Host, mutually exclusive at app level)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('seeker', 'host')),
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

-- -----------------------------------------------------------------------------
-- seeker_profiles — Seeker prefs (budget / stay window; 0–MAX = "don't mind" in UI)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seeker_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  budget_min INTEGER NOT NULL DEFAULT 0 CHECK (budget_min >= 0),
  budget_max INTEGER NOT NULL CHECK (budget_max >= budget_min),
  stay_start_date DATE NOT NULL,
  stay_end_date DATE NOT NULL,
  room_type_pref TEXT,
  furnished_pref BOOLEAN,
  gender_pref TEXT,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seeker_stay_window CHECK (stay_start_date <= stay_end_date)
);

-- -----------------------------------------------------------------------------
-- listings — Host listing (MVP: one active listing per host via partial unique index)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  price_monthly INTEGER NOT NULL CHECK (price_monthly >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  room_type TEXT NOT NULL,
  furnished BOOLEAN NOT NULL,
  rules TEXT NOT NULL,
  utilities TEXT,
  gender_pref TEXT,
  floor_plan_url TEXT,
  deposit INTEGER,
  application_fee INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listing_date_window CHECK (start_date <= end_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_one_active_per_host
  ON public.listings (host_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_listings_host ON public.listings (host_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings (status);

-- -----------------------------------------------------------------------------
-- listing_photos — min 3 enforced in app before publish; DB keeps order
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_listing_photos_listing ON public.listing_photos (listing_id);

-- -----------------------------------------------------------------------------
-- interests — Like / Interest + optional note (≤50 chars); not a chat room
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  body TEXT CHECK (body IS NULL OR char_length(body) <= 50),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT interests_no_self CHECK (sender_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interests_one_pending_per_triplet
  ON public.interests (sender_id, recipient_id, listing_id)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_interests_recipient_state ON public.interests (recipient_id, state);
CREATE INDEX IF NOT EXISTS idx_interests_sender ON public.interests (sender_id);
CREATE INDEX IF NOT EXISTS idx_interests_listing ON public.interests (listing_id);

-- -----------------------------------------------------------------------------
-- matches — created on accept or mutual-interest resolution (app / future trigger)
-- user_one / user_two lexicographic order for stable uniqueness
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  user_two UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_user_order CHECK (user_one < user_two),
  CONSTRAINT matches_distinct_users CHECK (user_one <> user_two)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair ON public.matches (user_one, user_two);
CREATE INDEX IF NOT EXISTS idx_matches_listing ON public.matches (listing_id);

-- -----------------------------------------------------------------------------
-- conversations — 1:1 with match; text-only chat, images out of MVP
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL UNIQUE REFERENCES public.matches (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- messages — Realtime publication added below
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- feed_passes — swipe Pass on listing or seeker card (priority layer with Decline in app)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('listing', 'user')),
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (swiper_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_passes_swiper ON public.feed_passes (swiper_id);

-- -----------------------------------------------------------------------------
-- updated_at touch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_seeker_profiles_updated ON public.seeker_profiles;
CREATE TRIGGER trg_seeker_profiles_updated
  BEFORE UPDATE ON public.seeker_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_listings_updated ON public.listings;
CREATE TRIGGER trg_listings_updated
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interests_updated ON public.interests;
CREATE TRIGGER trg_interests_updated
  BEFORE UPDATE ON public.interests
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security (Supabase client + auth.uid())
-- Service role (FastAPI) bypasses RLS.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "seeker_profiles_own" ON public.seeker_profiles;
CREATE POLICY "seeker_profiles_own"
  ON public.seeker_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listings_select_active_or_own" ON public.listings;
CREATE POLICY "listings_select_active_or_own"
  ON public.listings FOR SELECT TO authenticated
  USING (status = 'active' OR auth.uid() = host_id);

DROP POLICY IF EXISTS "listings_insert_host" ON public.listings;
CREATE POLICY "listings_insert_host"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "listings_update_own" ON public.listings;
CREATE POLICY "listings_update_own"
  ON public.listings FOR UPDATE TO authenticated
  USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "listings_delete_own" ON public.listings;
CREATE POLICY "listings_delete_own"
  ON public.listings FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "listing_photos_select" ON public.listing_photos;
CREATE POLICY "listing_photos_select"
  ON public.listing_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_id AND (l.status = 'active' OR l.host_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "listing_photos_mutate_own_listing" ON public.listing_photos;
CREATE POLICY "listing_photos_mutate_own_listing"
  ON public.listing_photos FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.host_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.host_id = auth.uid())
  );

DROP POLICY IF EXISTS "interests_participants" ON public.interests;
DROP POLICY IF EXISTS "interests_select_participants" ON public.interests;
DROP POLICY IF EXISTS "interests_insert_sender" ON public.interests;
DROP POLICY IF EXISTS "interests_update_participants" ON public.interests;

CREATE POLICY "interests_select_participants"
  ON public.interests FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "interests_insert_sender"
  ON public.interests FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "interests_update_participants"
  ON public.interests FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "matches_participants" ON public.matches;
CREATE POLICY "matches_participants"
  ON public.matches FOR SELECT TO authenticated
  USING (user_one = auth.uid() OR user_two = auth.uid());

DROP POLICY IF EXISTS "conversations_participants" ON public.conversations;
CREATE POLICY "conversations_participants"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id AND (m.user_one = auth.uid() OR m.user_two = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_participants" ON public.messages;
CREATE POLICY "messages_participants"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_id
        AND (m.user_one = auth.uid() OR m.user_two = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_insert_participant" ON public.messages;
CREATE POLICY "messages_insert_participant"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.matches m ON m.id = c.match_id
      WHERE c.id = conversation_id
        AND (m.user_one = auth.uid() OR m.user_two = auth.uid())
    )
  );

DROP POLICY IF EXISTS "feed_passes_own" ON public.feed_passes;
CREATE POLICY "feed_passes_own"
  ON public.feed_passes FOR ALL TO authenticated
  USING (swiper_id = auth.uid())
  WITH CHECK (swiper_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Realtime: messages (typing / presence out of MVP)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
