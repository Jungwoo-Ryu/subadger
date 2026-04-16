# subadger

모노레포: **FastAPI 백엔드**, **React Native(Expo) 모바일**, **Supabase**.

```text
subadger/
├── backend/          # FastAPI API
├── mobile/           # React Native (Expo) — README 참고 후 스캐폴딩
├── supabase/         # 마이그레이션
├── docs/             # 스펙·스키마 문서
├── package.json      # npm run api | mobile (선택)
└── .env              # 저장소 루트 (backend가 로드)
```

## 백엔드 (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

또는 루트에서: `npm run api` (Node 설치된 경우)

`.env`는 **저장소 루트**에 두면 `backend/main.py`가 자동으로 읽습니다.

## 모바일 (Expo)

[`mobile/README.md`](mobile/README.md) 참고.

```bash
cd mobile
npm install
npx expo start
```

또는 루트: `npm run mobile`

**실기기(Expo Go):** `mobile/app.config.js`가 PC의 LAN IP로 API URL을 자동 설정합니다(`EXPO_PUBLIC_API_URL` 미설정 시). 맥 방화벽에서 8000 허용, 백엔드는 `npm run api`(`0.0.0.0`).

데모 유저·피드 데이터: [`docs/DEMO_MOBILE.md`](docs/DEMO_MOBILE.md)

## DB (Supabase Postgres)

- **Schema:** `supabase/migrations/20260320000000_roomie_schema.sql` — [`docs/schema.md`](docs/schema.md)
- **Supabase CLI:** `supabase db push` (권장)
- **FastAPI:** `DATABASE_URL` 설정. `public.profiles`가 없을 때만 `psql`로 부트스트랩. 운영에서는 `SKIP_SCHEMA_INIT=1` 권장.

루트 `.env`를 사용하세요. 백엔드는 저장소 루트의 `.env`를 자동으로 읽습니다.

## Docker

저장소 루트에서 빌드 (컨텍스트에 `backend/`, `supabase/` 포함):

```bash
docker build -t subadger:local .
```
## UIUX Design
Onboarding

<img src="https://github.com/user-attachments/assets/6b674569-d75c-412e-8f13-e98a47a7f009" width="300"/>
<img src="https://github.com/user-attachments/assets/b4298446-6084-4eef-8f4b-154a88f496d9" width="300"/>
