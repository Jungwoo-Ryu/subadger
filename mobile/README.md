# Subadger — React Native (Expo)

모노레포의 모바일 앱 디렉터리입니다. 아직 프로젝트가 없다면 **저장소 루트**에서 한 번만 생성하세요.

## 새 Expo 앱 생성 (이 폴더가 비어 있을 때)

```bash
cd /path/to/subadger
npx create-expo-app@latest mobile --template blank-typescript
```

이미 `mobile/`에 파일이 있다면, 대신 빈 폴더를 만들고 그 안에서:

```bash
cd mobile
npx create-expo-app@latest . --template blank-typescript
```

## 실행

```bash
cd mobile
npx expo start
```

## 환경 변수

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase Project URL  
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — anon public key (클라이언트용)

**service_role / DB 비밀번호는 앱에 넣지 마세요.**

## 백엔드

FastAPI는 `../backend` — 로컬에서 `http://127.0.0.1:8000` (또는 LAN IP) 로 호출합니다.
