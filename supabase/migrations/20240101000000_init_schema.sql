-- ==========================================
-- 1. 유저 (Users) 테이블
-- 기본 정보, 성별, 앱 모드(토글), 일일 좋아요 제한 관리
-- ==========================================
CREATE TABLE public.users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY, -- Supabase Auth 연동
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')), -- 성별
  profile_image_url TEXT,
  bio TEXT,
  
  -- ⭐️ 앱 내 현재 모드 (방 구하기 vs 방 내놓기)
  current_app_mode TEXT DEFAULT 'seeker' CHECK (current_app_mode IN ('seeker', 'host')),
  
  -- 일일 좋아요 제한 로직
  daily_like_limit INTEGER DEFAULT 20,
  likes_used_today INTEGER DEFAULT 0,
  last_like_date DATE DEFAULT CURRENT_DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 2. 시커 프로필 (Seeker Profiles) 테이블
-- 방을 구하는 사람들의 희망 조건 (호스트 모드에서 스와이프됨)
-- ==========================================
CREATE TABLE public.seeker_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- 가격 조건
  target_price_min INTEGER DEFAULT 0,
  target_price_max INTEGER NOT NULL,
  
  -- 기간 조건
  desired_start_date DATE NOT NULL,
  desired_end_date DATE NOT NULL,
  
  -- 룸메이트 성별 선호도
  preferred_gender TEXT DEFAULT 'Any' CHECK (preferred_gender IN ('Male', 'Female', 'Any')),
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT check_seeker_dates CHECK (desired_start_date < desired_end_date)
);

-- ==========================================
-- 3. 매물 (Properties) 테이블
-- 호스트가 내놓은 서블리스 방 정보 (시커 모드에서 스와이프됨)
-- ==========================================
CREATE TABLE public.properties (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  host_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  
  -- 매물 기본 정보
  apartment_name TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  image_urls TEXT[] NOT NULL,
  
  -- 가격 정보 (원가 vs 서블렛 할인가)
  original_rent_price INTEGER NOT NULL,
  sublet_price INTEGER NOT NULL,
  avg_utility_fee INTEGER NOT NULL,
  
  -- 기간 조건
  available_start_date DATE NOT NULL,
  available_end_date DATE NOT NULL,
  
  -- 룸메이트/들어올 사람 성별 선호도
  preferred_gender TEXT DEFAULT 'Any' CHECK (preferred_gender IN ('Male', 'Female', 'Any')),
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT check_property_dates CHECK (available_start_date < available_end_date)
);

-- ==========================================
-- 4. 스와이프 (Swipes) 테이블
-- 양방향 스와이프(매물 평가 & 시커 평가) 통합 관리
-- ==========================================
CREATE TABLE public.swipes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  swiper_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  
  -- 타겟 구분
  target_type TEXT NOT NULL CHECK (target_type IN ('property', 'seeker')), 
  target_property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  target_seeker_id UUID REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  
  action TEXT NOT NULL CHECK (action IN ('like', 'pass')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT check_target_consistency CHECK (
    (target_type = 'property' AND target_property_id IS NOT NULL AND target_seeker_id IS NULL) OR
    (target_type = 'seeker' AND target_seeker_id IS NOT NULL AND target_property_id IS NULL)
  ),
  UNIQUE(swiper_id, target_property_id),
  UNIQUE(swiper_id, target_seeker_id)
);

-- ==========================================
-- 5. 매칭 (Matches) 테이블
-- 양방향 좋아요 성립 시 생성되는 채팅방의 뼈대
-- ==========================================
CREATE TABLE public.matches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  seeker_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(property_id, seeker_id)
);

-- ==========================================
-- 6. 메시지 (Messages) 테이블
-- 실시간 채팅 내역 (Supabase Realtime 연동용)
-- ==========================================
CREATE TABLE public.messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 7. ⭐️ 핵심 로직: 양방향 자동 매칭 생성 트리거 함수
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
  -- 오직 'like(좋아요)' 액션이 발생했을 때만 실행
  IF NEW.action = 'like' THEN

    -- [Case 1] Seeker가 특정 'Property'에 좋아요를 누른 경우
    IF NEW.target_type = 'property' THEN
      v_seeker_user_id := NEW.swiper_id;
      
      SELECT host_id INTO v_host_id FROM public.properties WHERE id = NEW.target_property_id;
      SELECT id INTO v_seeker_profile_id FROM public.seeker_profiles WHERE user_id = v_seeker_user_id;

      -- 호스트가 이미 이 Seeker를 좋아요 했는지 확인
      IF EXISTS (
        SELECT 1 FROM public.swipes 
        WHERE swiper_id = v_host_id 
          AND target_type = 'seeker' 
          AND target_seeker_id = v_seeker_profile_id 
          AND action = 'like'
      ) THEN
        SELECT EXISTS (
          SELECT 1 FROM public.matches 
          WHERE property_id = NEW.target_property_id AND seeker_id = v_seeker_user_id
        ) INTO v_is_match_exists;

        IF NOT v_is_match_exists THEN
          INSERT INTO public.matches (property_id, seeker_id) 
          VALUES (NEW.target_property_id, v_seeker_user_id);
        END IF;
      END IF;

    -- [Case 2] Host가 'Seeker' 프로필에 좋아요를 누른 경우
    ELSIF NEW.target_type = 'seeker' THEN
      v_host_id := NEW.swiper_id;
      
      SELECT user_id INTO v_seeker_user_id FROM public.seeker_profiles WHERE id = NEW.target_seeker_id;

      -- 이 Seeker가 현재 호스트의 매물 중 하나라도 이미 좋아요를 눌렀는지 확인
      SELECT p.id INTO v_matched_property_id 
      FROM public.properties p
      JOIN public.swipes s ON s.target_property_id = p.id
      WHERE p.host_id = v_host_id 
        AND s.swiper_id = v_seeker_user_id 
        AND s.target_type = 'property' 
        AND s.action = 'like'
      LIMIT 1;

      IF v_matched_property_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.matches 
          WHERE property_id = v_matched_property_id AND seeker_id = v_seeker_user_id
        ) INTO v_is_match_exists;

        IF NOT v_is_match_exists THEN
          INSERT INTO public.matches (property_id, seeker_id) 
          VALUES (v_matched_property_id, v_seeker_user_id);
        END IF;
      END IF;

    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 8. ⭐️ 스와이프 테이블에 트리거 부착
-- ==========================================
DROP TRIGGER IF EXISTS trigger_check_match ON public.swipes;
CREATE TRIGGER trigger_check_match
AFTER INSERT ON public.swipes
FOR EACH ROW
EXECUTE FUNCTION public.check_and_create_match();
