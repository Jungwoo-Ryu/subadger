# 모바일 데모 데이터

`Matching` / `List` 탭은 `GET /v1/feed?user_id=...` 를 호출합니다. 동작하려면:

1. Supabase에 **Auth 사용자** + `public.profiles` 행이 있어야 합니다.
2. `listings` 가 `active` 이고 `listing_photos` 에 URL이 있으면 카드에 표시됩니다.

## EXPO_PUBLIC_DEMO_USER_ID

`mobile/.env` 에 **실제 `profiles.id` UUID** 를 넣으세요. 기본 플레이스홀더 UUID는 DB에 없으면 피드가 비어 있습니다.

## 실제 기기에서 API

같은 Wi‑Fi에서 노트북 IP를 쓰세요 (예: `http://192.168.0.12:8000`).

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
```

## 이메일 도메인 체크

`POST /v1/auth/check-email` — `ALLOWED_EMAIL_SUFFIX` (기본 `@wisc.edu`).
