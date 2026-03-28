# SubLease Match

모바일 서브리스 매칭 앱 (Expo SDK 54 / React Native 0.81).

## 실행 방법
1) 의존성 설치  
```bash
npm install
```
2) 환경 변수 파일 생성  
```bash
copy .env.example .env
```
3) 개발 서버 실행 (Metro 캐시 초기화 포함)  
```bash
npx expo start -c
```
3) iOS/Android 시뮬레이터 또는 Expo Go 앱에서 QR 코드로 열기.

## 스크립트
- `npm run start` : Expo 개발 서버 시작
- `npm run android` : 안드로이드 에뮬레이터로 실행
- `npm run ios` : iOS 시뮬레이터로 실행
- `npm run web` : 웹 환경으로 실행

## 폴더 구조
- `App.tsx` — 메인 앱 엔트리 및 UI
- `src/data.ts` — mock 데이터 및 타입 정의
- `assets/` — 이미지 등 정적 리소스

## 환경 변수
- `EXPO_PUBLIC_API_URL` — FastAPI base URL
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- 모바일 앱에는 `DATABASE_URL`, `service_role`, DB 비밀번호를 넣지 않습니다.

## 주의사항
- `node_modules/`, `android/`, `ios/` 등은 `.gitignore`로 관리됩니다.
- SDK 54에 맞춘 종속성 버전이 잠겨 있으니 `npm install` 대신 `npm ci`를 권장합니다.
- 현재 앱 코드는 mock 데이터 중심이라 env 파일은 백엔드/Supabase 연결 작업을 위한 준비 단계입니다.
