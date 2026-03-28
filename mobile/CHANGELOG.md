# Roomie — Changelog

## v0.2.0 — March 6, 2026

---

### Tinder-Style Card Overhaul

- **Full-screen card layout** — Card now starts from the very top of the screen and extends edge-to-edge (no side margins), matching Tinder's immersive photo-first design
- **Bottom-only rounded corners** — Card has `borderBottomLeftRadius: 32` and `borderBottomRightRadius: 32` with square top edges, creating a clean visual separation from the nav bar below
- **Removed header logo** — "Roomie" branding and role badge removed from the explore screen; only the logout button remains, overlaid on the card with a translucent dark background (`rgba(0,0,0,0.35)`)
- **Dynamic card height** — `CARD_HEIGHT` is now calculated as `SCREEN_HEIGHT - TAB_BAR_HEIGHT - 12`, ensuring the card always fits perfectly above the nav bar with a clean 12px gap
- **Dark theme** — Background color switched to `#000`, status bar set to `light-content`, and tab bar restyled as a dark floating island (`#1A1A1A` with `borderRadius: 28`)

---

### Action Buttons Moved Inside Card

- **Buttons inside the card** — Like/Nope action buttons are now rendered **inside** `PropertyCardContent` and `SeekerCardContent`, positioned at `bottom: 20` within the card's gradient area (matching Tinder where buttons sit inside the card, not externally)
- **Button sizing** — 76×76px dark circles (`#1A1A1A`) with colored borders (red for Nope, green for Like) and proportional icons (`close: 38px`, `heart: 34px`)
- **Button props** — `onNope` and `onLike` callbacks passed only to the top card (`isTopCard`) to prevent interaction with background cards
- **Removed `ActionButtons` component render** — External `ActionButtons` component no longer rendered outside the card deck

---

### Top & Bottom Gradient Overlays

- **Top gradient added** — `LinearGradient` from `rgba(0,0,0,0.6)` → `transparent` across the top 120px of the card, ensuring the exit button and progress indicator bars are always visible over bright images
- **Bottom gradient refined** — Gradient colors adjusted to `['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', '#000']` covering `CARD_HEIGHT * 0.35` for a smoother dark fade at the bottom

---

### Card Info & Controls Positioning

- **Card info text** — Name, address, and price positioned at `bottom: 110` inside the card, above the action buttons
- **Detail expand button** — Repositioned to `bottom: 115`, sized at 48×48px with `borderRadius: 24`
- **Progress indicator bar** — Moved down to `top: 66` (iOS) / `StatusBar.currentHeight + 16` (Android) to align with the exit button level
- **LIKE/NOPE swipe stamps** — Repositioned higher (`top: 25%` from `40%`), enlarged to `fontSize: 42`, thicker border (`4px`), and wider letter spacing (`3`)

---

### Smooth Card Transitions

- **Eliminated transition lag** — Removed `scale` (0.96/0.92) and `translateY` offset from background cards; all cards now render at full size behind the top card, eliminating the visible "enlargement snap" when transitioning to the next card

---

### Property Detail Page — Map Integration

- **Map view** — Replaced the static header image in the Property Detail Modal (Seeker view) with an interactive `MapView` from `react-native-maps`, pinpointing the property's exact location with a `Marker`
- **Property coordinates** — Added `coordinates: { latitude, longitude }` field to the `Property` interface and all mock data entries (Madison, WI area coordinates)
- **Map container** — 250px tall with `borderRadius: 16` and `overflow: hidden`

#### Tech Stack Addition
| Package | Version | Purpose |
|---------|---------|---------|
| `react-native-maps` | `1.20.1` | Interactive map with marker in property detail modal |

---

### Date Visibility Enhancement

- **Highlighted dates** — Start/end dates in the Property Detail Modal now use distinct styles: `modalInfoValueHighlight` (`fontSize: 16`, `fontWeight: 900`, `color: #6C5CE7`) and `modalInfoSubHighlight` (`fontSize: 12`, `fontWeight: 700`, `color: #8A7BEE`)

---

### Files Modified

| File | Changes |
|------|---------|
| `App.tsx` | Full Tinder-style card overhaul, dark theme, action buttons inside card, top/bottom gradients, map integration in detail modal, stamp sizing, progress bar positioning, transition fix |
| `src/data.ts` | Added `coordinates` field to `Property` interface and all mock property entries |
| `package.json` | Added `react-native-maps` dependency |

## v0.1.0 — March 4, 2026

---

### Features Added

- **Dual Auth Flow** — Role selection screen + separate Login/Signup for Seekers and Room Owners
- **Seeker Dashboard** — Tinder-style swipe cards showing room listings (price, dates, location, room type, furnished, utilities, gender pref, rules)
- **Owner Dashboard** — Swipe cards showing people looking for rooms (budget, dates, gender pref, lifestyle tags)
- **Detail Modal** — Slide-up sheet on each card with full listing/seeker info; dismissible via swipe-down gesture
- **Multi-Image Carousel** — Cards support multiple photos; tap left/right edges to browse (like Tinder)
- **Swipe Animations** — LIKE/NOPE stamps with card fly-off animation on both gesture swipe and button tap

---

### UI / Branding

- **Renamed app** from "SubMatch" → **Roomie** across all screens
- **Redesigned Auth screens** — white background, pink accents, dark text, clean modern aesthetic
  - `RoleSelectionScreen`, `SeekerAuthScreen`, `OwnerAuthScreen` all updated
- **Bigger cards** — `CARD_HEIGHT` increased from 65% → 75% of screen; `CARD_WIDTH` edge-to-edge (−24px)
- **Proportional text scaling** — apartment name (27px), price (26px), address (15px), dates (14px) all bumped up
- **Larger action buttons** — Like/Nope buttons 66×66px with wider spacing
- **Larger detail button** — 44×44px with clearer border

---

### Animation & Performance

- **Modal overlay fade** — grey dimming background now smoothly fades in/out (was instant before)
  - Uses `Animated.timing` + `overlayOpacity` animated value
  - `onShow` callback ensures animation starts only after Modal mounts
- **Drag-linked overlay** — overlay opacity tracks finger position during swipe-down dismiss
- **Spring → Timing** — replaced `Animated.spring` with `Animated.timing` (350ms open, 280ms close) for predictable 60fps
- **Image tap zones** — expanded from 35% → 45% width on each side; full card height
- **Tap vs Hold** — image navigation uses `onPress` (tap+release only), not `onPressIn`
- **Button swipe animation** — tapping Like/Nope buttons now plays the fly-off animation instead of instantly removing

---

### Bugs Fixed

- React Hooks ordering error from conditional `useRef` placement
- `Animated.timing` type error with `Animated.add`
- Modal jank on swipe-down dismiss (overlay cutting out)
- Image carousel lag on rapid taps
- Detail button unresponsive due to z-index layering conflict
- Shadow not appearing on modal open (race condition with Modal mount timing)

---

### Files Modified

| File | Changes |
|------|---------|
| `App.tsx` | Card sizing, animations, modals, branding, carousel, action buttons |
| `RoleSelectionScreen.tsx` | White/pink theme, "Roomie" branding |
| `SeekerAuthScreen.tsx` | White/pink theme, dark text, pink accents |
| `OwnerAuthScreen.tsx` | White/pink theme, matching Seeker auth style |
