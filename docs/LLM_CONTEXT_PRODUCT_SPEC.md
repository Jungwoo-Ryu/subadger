# Roomie / SwipLease — Product & Technical Context (LLM / Handoff Doc)

> **Purpose:** 이 문서는 제품 결정사항·도메인 규칙·데이터/UX 방향을 한 번에 전달하기 위한 **싱글 소스 컨텍스트**다. 다른 LLM(예: GPT)이나 신규 팀원 온보딩 시 그대로 붙여 넣어 사용하면 된다.  
> **Last aligned with PM/Founder:** 2026-03-20 (대화 기준 동기화)

---

## 1. One-liner

**Tinder 스타일의 카드 스와이프로 서브리스(서블렛) 매물·구하는 사람을 탐색하고, Hinge 스타일의 “관심(라이크) + 선택적 짧은 메시지 → 상대 수락/거절 → 매치 시 1:1 채팅”으로 계약 전 대화까지 이어지는 모바일 MVP.**

---

## 2. 사용자 역할 (Seeker / Host)

| Role | 한글 | 설명 |
|------|------|------|
| **Seeker** | 서브리터(Subletter) | 서브리스를 **구하는** 사람 |
| **Host** | 서브리저(Subleaser) | 서브리스를 **내놓는** 사람 (리스팅 소유자) |

### 2.1 역할 상호 배타성 (중요)

- 한 계정은 **Seeker와 Host를 동시에 둘 수 없다.**
- 역할 변경이 필요하면 **계정 삭제 후 재가입**으로만 가능하다.
- DB·앱 레벨 모두에서 이 제약을 강제하는 것이 목표다.

---

## 3. 인증 (MVP)

- **학교 이메일 기반** 로그인이 MVP다. (UW-Madison SSO는 후순위.)
- **이메일 도메인 제한:** `@wisc.edu` (또는 팀이 확정한 학교 도메인) — **앱(클라이언트)과 DB(제약/트리거 또는 RLS 보조) 양쪽**에서 검증한다.
- 인증 구현체(Supabase Auth vs 커스텀 JWT 등)는 스택에 맞게 선택하되, “허용 도메인만 가입”은 비기능 요구사항으로 고정한다.

---

## 4. 핵심 제품 루프: Hinge형 “관심” + 선택 메시지

### 4.1 통칭

- **Like / Interest / 친구신청** 은 **동일한 도메인 이벤트**로 취급한다. (별도 “Offer” 테이블·기능은 **삭제/미사용** — Like 시 옵션 메시지로 흡수했다.)

### 4.2 Seeker ↔ Host 대칭성

- **Seeker가 Host(의 리스팅)에게 Like**를 보낼 수 있다.
- **Host가 Seeker에게 Like**를 보낼 수 있다. (자신의 리스팅 조건에 맞는 Seeker를 발견했을 때 **먼저 어필**하는 플로우를 명시적으로 지원한다.)
- 양 방향 모두 **동작 방식은 동일**하다: *Like + (선택) 짧은 메시지 → 수신자 수락/거절*.

### 4.3 Like에 붙는 메시지 (채팅과 구분)

- Like와 함께 보내는 텍스트는 **채팅방이 아니다.**
- **최대 50자**의 **짧은 메시지**(Hinge의 like comment와 동일한 성격).
- **선택 사항:** 메시지 없이 Like만 보낼 수 있다.

### 4.4 수락 시 채팅 시작 규칙

- **매치(Match)** 가 성립하는 시점에 **1:1 채팅방을 생성**하는 것이 원칙이다. (매치 전 임시 채팅방은 두지 않는다.)
- 수락 직후 채팅방의 초기 상태:
  - Like에 **메시지가 있었으면:** 그 메시지를 **채팅의 첫 메시지(또는 시스템/인용 형태의 첫 버블)** 로 반영해 대화가 이어지게 한다. (구현 디테일은 FE/BE가 선택하되, 사용자 경험은 “보냈던 한 마디로 대화가 시작됨”.)
  - **메시지가 없었으면:** **빈 채팅방**에서 시작한다.

### 4.5 거절(Decline) 동작

- 거절 시 **당장 피드/큐에서 보이지 않게** 처리한다.
- 단, **완전 영구 차단이 아니라**, 내부적으로 **노출 우선순위를 최하단**으로 둔다.
- **피드 큐가 한 사이클 돌면** 다시 노출될 수 있다. (재매칭 시도·실수 교정·데이터 희소성 대응)

### 4.6 Pass (스와이프 왼쪽 등)

- 본 문서에서 PM이 명시적으로 “Pass = 거절과 동일 규칙”이라고 하지는 않았으므로 구현 시 다음 중 하나로 **명시적으로 결정**해야 한다. (LLM 구현 시 TODO로 남김)
  - **A)** Pass는 Decline과 동일한 우선순위/재등장 규칙
  - **B)** Pass는 낮은 우선순위지만 Decline과 다른 쿨다운
  - **C)** Pass는 일정 기간 숨김 후 재노출

현재 확정된 것은 **Decline** 쪽이다. Pass는 스프린트 회의에서 API `action: pass` 와 합치되면 동일 정책으로 가져가는 것이 자연스럽다.

---

## 5. “문의하기”

- **문의하기**는 별도 채널로 두지 않고, 위 **Like + (선택) 50자 메시지** 플로우로 **흡수**한다.
- 즉 사용자 입장에서는 “관심 표시 + 한 마디”가 곧 문의의 시작이다.

---

## 6. 피드·카드 UX (참고: Tinder + Hinge)

### 6.1 공통 인터랙션 (기존 스프린트 합의와 정합)

- **스와이프:** Pass / Like (Tinder-like).
- **카드 오른쪽 영역 탭:** 업로드된 **사진 갤러리** (다중 사진).
- **카드 우측 하단 작은 버튼:** **상세 스크롤 시트** (필수 필드 + 옵션 필드 표시, 스크롤).

### 6.2 카드에 실제로 올라갈 정보 (권장 스펙)

피드에는 **두 종류의 카드**가 존재할 수 있다. (Host가 Seeker를 스와이프할 때와 Seeker가 리스팅을 스와이프할 때.)

#### 6.2.1 Seeker가 보는 카드: **리스팅 카드 (Listing)**

**항상 노출 권장 (핵심 스캔 정보)**

- **사진:** 대표 썸네일 + (UI상) 추가 장수 표시; 리스팅은 **최소 3장** (아래 리스팅 스펙).
- **월세 (base rent):** 숫자 + 통화/기간 명시 (예: `/month`).
- **유틸:** 포함 여부 또는 월 추정액(필드가 있을 때). *리스팅 스키마에서 optional이면 카드에도 “미기재” 처리.*
- **입주/퇴거 가능 기간:** `start_date` ~ `end_date` (또는 “유동” 표기 규칙).
- **주소:** MVP는 **풀 주소**가 스키마상 필수이나, **카드 표면에서는 프라이버시를 위해 줄임 표기**를 권장 (예: 도로명 일부 + 동네/우편번호 일부만). *풀 주소는 상세 시트·매치 후 단계에서.*
- **Room type:** Studio / 1B / Shared / 2B+ 등 팀이 정한 enum.
- **Furnished / Unfurnished.**

**강력 권장 (신뢰·필터링)**

- **Rules 요약:** 1~2줄 또는 아이콘 태그 (no smoking, no pets, quiet hours 등).
- **보증금 / 애플리케이션 비:** 값이 있을 때만 배지/한 줄 표시 (*둘 다 스키마상 optional*).

**선택 (있으면 표시)**

- **Gender preference** (리스팅 측 선호).
- **Utilities 상세 문자열** (포함 범위: 전기/가스/인터넷 등).
- **Floor plan:** 썸네일 또는 “플랜 있음” 뱃지 → 탭 시 시트/뷰어.

**상세 페이지/시트에서만 (카드 본문 과밀 방지)**

- **위경도 좌표:** 사용자 확정 사항 — **리스팅 디테일(지도)** 에서 노출. 카드 정면에는 굳이 지도 핀을 두지 않아도 됨.
- **규칙 전문, 긴 설명 텍스트.**

#### 6.2.2 Host가 보는 카드: **Seeker 프로필 카드 (Seeker Profile)**

Host는 **“조건에 맞는 Seeker”** 를 찾아 Like+메시지를 보낼 수 있어야 한다.

**항상 노출 권장**

- **프로필 사진** (최소 1장 권장; 팀 정책으로 최소 장수를 정하면 DB에 반영).
- **표시 이름 / 닉네임.**
- **희망 budget range:** `budget_min` ~ `budget_max` (월세 기준; 유틸 포함 여부는 Seeker prefs에 플래그로 두는 것을 권장).
- **희망 입주·퇴거 기간** (날짜 범위).
- **선호 room type**, **furnished 선호.**

**선택**

- **Gender** (Seeker 본인) 및 **룸메이트/매칭 관련 선호** (성별 선호, 흡연/반려, 생활 패턴 등 — MVP 범위는 팀이 취사선택).
- **선호 지역:** neighborhood 멀티선택 또는 “캠퍼스로부터 X mile” 같은 필터는 **prefs JSON 또는 정규화 테이블**로 확장 가능.

**매칭 품질을 위한 UI 힌트 (권장)**

- Host의 **활성 리스팅**과 Seeker prefs가 겹치는 항목에 **“Matches your listing”** 뱃지 (가격대, 기간, 룸타입 등).

---

## 7. 리스팅(Listing) 데이터 요구사항 (MVP)

### 7.1 필수

- **사진:** 최소 **3장**.
- **가격 (월세).**
- **기간:** 시작일 / 종료일 (또는 팀이 정한 duration 모델).
- **주소:** **풀 주소** (문자열). *표시 단계에서 카드 축약은 UX 이슈.*
- **Room type.**
- **Furnished / Unfurnished.**
- **Rules** (텍스트 또는 구조화된 규칙 — MVP는 텍스트로도 가능).

### 7.2 선택

- **Utilities** (포함 여부/상세).
- **Gender preference** (리스팅).
- **Floor plan** (파일/이미지 URL).
- **보증금 (Deposit).**
- **Application fee.**

### 7.3 위치

- **위경도:** 리스팅 **디테일**에 사용 (지도). 카드 노출 정책은 UX 선택.

---

## 8. 좋아요 탭 (Hinge Likes 탭 모델)

- 제품 방향: **Hinge의 Likes 탭**과 유사한 정보 구조.
- **Host가 먼저 Seeker에게 Like**를 보내 자신의 포스팅을 어필할 수 있어야 한다. (Seeker가 먼저 보내는 케이스와 대칭.)
- UI에서 일반적으로 필요한 리스트 (이름은 제품 카피에 맞게 조정):
  - **보낸 관심 / 받은 관심** (읽지 않음, 수락 대기, 거절됨 등 상태 세분화는 구현 단계에서 상태 머신으로 정의).

---

## 9. 채팅 (MVP 범위 축소)

- **실시간:** Supabase **Realtime** 활용을 전제로 한다 (채널 설계는 구현 문서에서 확정).
- **채팅방 생성 시점:** **매치 성립 시** 생성하는 방식이 권장되며, PM 답변과 정합.
- **이미지 전송:** MVP에서 **제외** (텍스트만).
- **대화:** **1:1만** 지원.

---

## 10. 스키마 / API 방향 (LLM이 구현할 때의 가이드)

> PM이 “테이블은 네가 정해도 된다”고 했으므로, 아래는 **권장 엔터티**이며 마이그레이션 파일명·컬럼명은 팀 컨벤션에 맞춘다.

### 10.1 최소 엔터티 (권장)

- **`users`:** `id`, `email`, `role` (`seeker` \| `host`), `profile`/`prefs` (JSON 또는 정규화), `created_at`, …
- **`listings`:** Host 소유, 7절 필드 + `lat`, `lng` (optional until geocoded), `status` (draft/active/…).
- **`listing_photos`:** `listing_id`, `url`, `sort_order`.
- **`seeker_prefs` 또는 `users.prefs`:** budget range, 날짜, room type, furnished, 지역/거리 prefs 등.
- **`interests` (또는 `likes`):** 단방향 관심 기록. 필수 개념:
  - **sender_user_id**
  - **recipient_user_id** (항상 사용자 기준으로 통일하는 것을 권장)
  - **context_listing_id** (nullable) — Seeker→Host 리스팅 관심이면 listing_id, Host→Seeker는 “어떤 리스팅에 대한 어필인지”를 남기려면 nullable이 아닐 수 있음. *구현 시 “Host가 보낸 관심은 반드시 특정 listing_id와 연결”을 권장.*
  - **message** (nullable, max 50 chars)
  - **state:** `pending` \| `accepted` \| `declined` \| `expired`(optional)
  - **timestamps**
- **`matches`:** `id`, `user_a`, `user_b`, `listing_id`(optional but recommended), `created_at`.
- **`conversations` + `messages`:** 1:1, 텍스트만. 첫 메시지 시드 규칙은 4.4절.

### 10.2 `swipes` (Pass)와의 관계

- 스와이프 액션 `pass`는 **interests와 분리**하는 편이 분석·추천 큐에 유리하다.
- `pass`/`hide`/`not_interested` 레코드는 **추천 큐 필터링**에 사용한다.

### 10.3 인덱싱·쿼리 힌트

- 받은 관심함 / 보낸 관심함: `(recipient_user_id, state, created_at)`, `(sender_user_id, created_at)`.
- 피드: `listings` 활성 + 지리/가격/날짜 필터 + 이미 스와이프한 항목 제외.

---

## 11. 비기능·정책 체크리스트

- [ ] 역할 상호 배타: 앱 + DB
- [ ] 이메일 도메인: 앱 + DB
- [ ] Like 메시지 50자: 앱 검증 + DB constraint (`check char_length <= 50`)
- [ ] 리스팅 사진 최소 3장: 앱 검증 + DB trigger 또는 애플리케이션 트랜잭션
- [ ] Decline 우선순위 최하단 + 큐 사이클 시 재노출 가능: 추천 서비스 로직에 반영
- [ ] 채팅은 매치 후, 텍스트만, 1:1
- [ ] 좌표는 디테일·지도 중심 (프라이버시 카피와 함께)

---

## 12. 의도적으로 보류·미확정 (다음 스프린트에서 결정)

- **Pass**와 **Decline**의 정책 동일 여부.
- Seeker 프로필 **최소 사진 장수**.
- **수락 후 첫 메시지**를 “일반 메시지 row”로 넣을지, “시스템 이벤트 + 인용 UI”로 넣을지.
- 추천 큐의 구체 알고리즘 (거리 가중, 최신순, 랜덤 혼합 등).

---

## 13. 한 줄 요약 (GPT용 초입력)

Sublease discovery app: Tinder swipe UX + Hinge-like interest flow. Users are **either** Seeker **or** Host (not both; must delete & recreate to switch). `@wisc.edu` enforced in app+DB. Interest can include optional **≤50 char** note (not a chat). On **accept**, create **1:1 text-only** chat; seed first message from note if present else empty thread. On **decline**, hide but **lowest priority** so it may reappear after queue cycles. Listings require **≥3 photos**, full address, price, dates, room type, furnished, rules; deposit/app fee optional; **lat/lng on detail**. Separate **offer** feature removed—optional message on like replaces it. Host can like seekers first to promote listing.

---

*End of document.*
