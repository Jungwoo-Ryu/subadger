# subadger-mobile (Expo)

## 실행

```bash
npm install
npx expo start
```

루트에서: `npm run mobile`

## API 주소 (실기기 Expo Go)

- `EXPO_PUBLIC_API_URL`을 **설정하지 않으면** `app.config.js`가 Metro를 실행하는 맥의 **LAN IPv4**로 `http://<ip>:8000`을 자동 넣습니다. 폰과 맥이 **같은 Wi‑Fi**에 있어야 합니다.
- 시뮬레이터만 쓸 때는 `mobile/.env`에 `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` 을 넣으세요.

백엔드는 반드시 `0.0.0.0:8000`에 떠 있어야 합니다 (`npm run api`).

## 로그인

Supabase Auth에 등록한 이메일·비밀번호 (예: `system` / `system` → 서버에서 `system@wisc.edu`로 정규화).
