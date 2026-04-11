-- Roomie reconciled database schema
-- Based on the backend draft, updated to reflect frontend data currently used in:
-- - src/data.ts
-- - App.tsx detail modals
-- - seeker/owner auth screens
--
-- Notes
-- 1. Credentials remain in auth.users (Supabase Auth). Do not duplicate password storage in public schema.
-- 2. The frontend auth screen uses the label "owner", but the domain model uses "host".
-- 3. This version stays close to the draft schema and adds the frontend-backed fields:
--    users.image_urls
--    seeker_profiles.about_me
--    seeker_profiles.lifestyle_tags
--    properties.room_type
--    properties.furnished
--    properties.house_rules
--    properties.latitude / properties.longitude

-- ==========================================
-- 1. Users
-- Profile + app state. Auth identity/email/password live in auth.users.
-- ==========================================
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  bio TEXT,

  -- Frontend uses a photo carousel for user cards, so a single profile image is not enough.
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Current in-app mode: seeker vs host
  current_app_mode TEXT NOT NULL DEFAULT 'seeker'
    CHECK (current_app_mode IN ('seeker', 'host')),

  -- Daily like limit tracking
  daily_like_limit INTEGER NOT NULL DEFAULT 20
    CHECK (daily_like_limit > 0),
  likes_used_today INTEGER NOT NULL DEFAULT 0
    CHECK (likes_used_today >= 0 AND likes_used_today <= daily_like_limit),
  last_like_date DATE NOT NULL DEFAULT CURRENT_DATE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 2. Seeker Profiles
-- One active preference profile per user.
-- ==========================================
CREATE TABLE public.seeker_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Budget preferences
  target_price_min INTEGER NOT NULL DEFAULT 0
    CHECK (target_price_min >= 0),
  target_price_max INTEGER NOT NULL
    CHECK (target_price_max >= target_price_min),

  -- Date preferences
  desired_start_date DATE NOT NULL,
  desired_end_date DATE NOT NULL,

  -- Roommate preference
  preferred_gender TEXT NOT NULL DEFAULT 'Any'
    CHECK (preferred_gender IN ('Male', 'Female', 'Any')),

  -- Added from frontend seeker detail UI
  about_me TEXT,
  lifestyle_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT check_seeker_dates
    CHECK (desired_start_date < desired_end_date)
);

-- ==========================================
-- 3. Properties
-- Host-listed sublet inventory shown in seeker mode.
-- ==========================================
CREATE TABLE public.properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,

  -- Base property info
  apartment_name TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  image_urls TEXT[] NOT NULL,

  -- Pricing
  original_rent_price INTEGER NOT NULL
    CHECK (original_rent_price > 0),
  sublet_price INTEGER NOT NULL
    CHECK (sublet_price > 0),
  avg_utility_fee INTEGER NOT NULL DEFAULT 0
    CHECK (avg_utility_fee >= 0),

  -- Availability
  available_start_date DATE NOT NULL,
  available_end_date DATE NOT NULL,

  -- Preference / details
  preferred_gender TEXT NOT NULL DEFAULT 'Any'
    CHECK (preferred_gender IN ('Male', 'Female', 'Any')),
  room_type TEXT NOT NULL
    CHECK (room_type IN ('Studio', 'Private Room', 'Shared Room', '1BR', '2BR')),
  furnished BOOLEAN NOT NULL DEFAULT FALSE,
  house_rules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Added from frontend map/detail view
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT check_property_dates
    CHECK (available_start_date < available_end_date),
  CONSTRAINT check_property_images
    CHECK (COALESCE(array_length(image_urls, 1), 0) > 0),
  CONSTRAINT check_property_coordinates_pair
    CHECK (
      (latitude IS NULL AND longitude IS NULL) OR
      (latitude IS NOT NULL AND longitude IS NOT NULL)
    ),
  CONSTRAINT check_property_latitude
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT check_property_longitude
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

-- ==========================================
-- 4. Swipes
-- Polymorphic swipe record for property and seeker-profile targets.
-- ==========================================
CREATE TABLE public.swipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swiper_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,

  target_type TEXT NOT NULL CHECK (target_type IN ('property', 'seeker')),
  target_property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  target_seeker_profile_id UUID REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN ('like', 'pass')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT check_target_consistency CHECK (
    (
      target_type = 'property' AND
      target_property_id IS NOT NULL AND
      target_seeker_profile_id IS NULL
    ) OR (
      target_type = 'seeker' AND
      target_seeker_profile_id IS NOT NULL AND
      target_property_id IS NULL
    )
  ),
  CONSTRAINT unique_property_swipe UNIQUE (swiper_id, target_property_id),
  CONSTRAINT unique_seeker_profile_swipe UNIQUE (swiper_id, target_seeker_profile_id)
);

-- ==========================================
-- 5. Matches
-- Created automatically when both sides like each other.
-- ==========================================
CREATE TABLE public.matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  seeker_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT unique_property_seeker_match UNIQUE (property_id, seeker_user_id)
);

-- ==========================================
-- 6. Messages
-- Realtime chat history for a match.
-- ==========================================
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 7. Helpful indexes
-- ==========================================
CREATE INDEX idx_seeker_profiles_active
  ON public.seeker_profiles (is_active, desired_start_date, desired_end_date);

CREATE INDEX idx_properties_host_active
  ON public.properties (host_id, is_active, available_start_date, available_end_date);

CREATE INDEX idx_swipes_swiper_created_at
  ON public.swipes (swiper_id, created_at DESC);

CREATE INDEX idx_swipes_target_property
  ON public.swipes (target_property_id)
  WHERE target_property_id IS NOT NULL;

CREATE INDEX idx_swipes_target_seeker_profile
  ON public.swipes (target_seeker_profile_id)
  WHERE target_seeker_profile_id IS NOT NULL;

CREATE INDEX idx_matches_seeker_user
  ON public.matches (seeker_user_id, created_at DESC);

CREATE INDEX idx_messages_match_created_at
  ON public.messages (match_id, created_at ASC);

-- ==========================================
-- 8. Match creation trigger function
-- ==========================================
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER AS $$
DECLARE
  v_host_id UUID;
  v_seeker_user_id UUID;
  v_seeker_profile_id UUID;
  v_matched_property_id UUID;
  v_is_match_exists BOOLEAN;
BEGIN
  IF NEW.action = 'like' THEN

    -- Case 1: seeker liked a property
    IF NEW.target_type = 'property' THEN
      v_seeker_user_id := NEW.swiper_id;

      SELECT host_id
      INTO v_host_id
      FROM public.properties
      WHERE id = NEW.target_property_id;

      SELECT id
      INTO v_seeker_profile_id
      FROM public.seeker_profiles
      WHERE user_id = v_seeker_user_id;

      IF v_seeker_profile_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.swipes
        WHERE swiper_id = v_host_id
          AND target_type = 'seeker'
          AND target_seeker_profile_id = v_seeker_profile_id
          AND action = 'like'
      ) THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.matches
          WHERE property_id = NEW.target_property_id
            AND seeker_user_id = v_seeker_user_id
        )
        INTO v_is_match_exists;

        IF NOT v_is_match_exists THEN
          INSERT INTO public.matches (property_id, seeker_user_id)
          VALUES (NEW.target_property_id, v_seeker_user_id);
        END IF;
      END IF;

    -- Case 2: host liked a seeker profile
    ELSIF NEW.target_type = 'seeker' THEN
      v_host_id := NEW.swiper_id;

      SELECT user_id
      INTO v_seeker_user_id
      FROM public.seeker_profiles
      WHERE id = NEW.target_seeker_profile_id;

      SELECT p.id
      INTO v_matched_property_id
      FROM public.properties p
      JOIN public.swipes s
        ON s.target_property_id = p.id
      WHERE p.host_id = v_host_id
        AND s.swiper_id = v_seeker_user_id
        AND s.target_type = 'property'
        AND s.action = 'like'
      ORDER BY s.created_at DESC
      LIMIT 1;

      IF v_matched_property_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.matches
          WHERE property_id = v_matched_property_id
            AND seeker_user_id = v_seeker_user_id
        )
        INTO v_is_match_exists;

        IF NOT v_is_match_exists THEN
          INSERT INTO public.matches (property_id, seeker_user_id)
          VALUES (v_matched_property_id, v_seeker_user_id);
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 9. Swipe trigger
-- ==========================================
DROP TRIGGER IF EXISTS trigger_check_match ON public.swipes;

CREATE TRIGGER trigger_check_match
AFTER INSERT ON public.swipes
FOR EACH ROW
EXECUTE FUNCTION public.check_and_create_match();
