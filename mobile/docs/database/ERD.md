# Roomie ERD

This ERD reflects the current frontend data model and keeps the backend draft mostly intact.

## Frontend-driven updates

- `users.image_urls` was added because the frontend uses multi-image user cards instead of a single profile photo.
- `seeker_profiles.about_me` and `seeker_profiles.lifestyle_tags` were added from the seeker detail modal.
- `properties.room_type`, `properties.furnished`, `properties.house_rules`, `properties.latitude`, and `properties.longitude` were added from the property detail UI.
- `auth.users` remains the source of truth for `email` and `password`; those fields should not be duplicated in `public.users`.
- `owner` in the auth UI maps to `host` in the database/domain model.

## Frontend to DB mapping

| Frontend field | Source | DB mapping |
| --- | --- | --- |
| `User.imageUrls` | `src/data.ts` | `public.users.image_urls` |
| `User.bio` | `src/data.ts` | `public.users.bio` |
| `Property.coordinates.latitude` | `src/data.ts`, `App.tsx` map modal | `public.properties.latitude` |
| `Property.coordinates.longitude` | `src/data.ts`, `App.tsx` map modal | `public.properties.longitude` |
| `Property.roomType` | `src/data.ts`, `App.tsx` property detail | `public.properties.room_type` |
| `Property.furnished` | `src/data.ts`, `App.tsx` property detail | `public.properties.furnished` |
| `Property.rules` | `src/data.ts`, `App.tsx` property detail | `public.properties.house_rules` |
| `SeekerProfile.aboutMe` | `src/data.ts`, `App.tsx` seeker detail | `public.seeker_profiles.about_me` |
| `SeekerProfile.lifestyle` | `src/data.ts`, `App.tsx` seeker detail | `public.seeker_profiles.lifestyle_tags` |
| `email`, `password` | auth screens | `auth.users.email`, `auth.users.encrypted_password` |

## ERD

```mermaid
erDiagram
  AUTH_USERS {
    uuid id PK
    text email
  }

  USERS {
    uuid id PK
    text name
    text gender
    text bio
    text[] image_urls
    text current_app_mode
    int daily_like_limit
    int likes_used_today
    date last_like_date
    timestamptz created_at
  }

  SEEKER_PROFILES {
    uuid id PK
    uuid user_id FK
    int target_price_min
    int target_price_max
    date desired_start_date
    date desired_end_date
    text preferred_gender
    text about_me
    text[] lifestyle_tags
    boolean is_active
    timestamptz created_at
  }

  PROPERTIES {
    uuid id PK
    uuid host_id FK
    text apartment_name
    text address
    text description
    text[] image_urls
    int original_rent_price
    int sublet_price
    int avg_utility_fee
    date available_start_date
    date available_end_date
    text preferred_gender
    text room_type
    boolean furnished
    text[] house_rules
    numeric latitude
    numeric longitude
    boolean is_active
    timestamptz created_at
  }

  SWIPES {
    uuid id PK
    uuid swiper_id FK
    text target_type
    uuid target_property_id FK
    uuid target_seeker_profile_id FK
    text action
    timestamptz created_at
  }

  MATCHES {
    uuid id PK
    uuid property_id FK
    uuid seeker_user_id FK
    timestamptz created_at
  }

  MESSAGES {
    uuid id PK
    uuid match_id FK
    uuid sender_id FK
    text content
    timestamptz created_at
  }

  AUTH_USERS ||--|| USERS : "profile"
  USERS ||--o| SEEKER_PROFILES : "has"
  USERS ||--o{ PROPERTIES : "hosts"
  USERS ||--o{ SWIPES : "creates"
  PROPERTIES ||--o{ SWIPES : "receives"
  SEEKER_PROFILES ||--o{ SWIPES : "receives"
  PROPERTIES ||--o{ MATCHES : "matched in"
  USERS ||--o{ MATCHES : "seeker side"
  MATCHES ||--o{ MESSAGES : "has"
  USERS ||--o{ MESSAGES : "sends"
```

## Relationship notes

- `users` to `seeker_profiles` is `1:0..1`, because each user can have at most one seeker profile in the current model.
- `users` to `properties` is `1:N`, because one host can list multiple properties.
- `swipes` is polymorphic:
  - when `target_type = 'property'`, `target_property_id` is populated
  - when `target_type = 'seeker'`, `target_seeker_profile_id` is populated
- `matches` connects one property with one seeker user.
- `messages` belong to a single match and are sent by a user participating in that match.

## SQL reference

The reconciled SQL version of this ERD lives in `docs/database/reconciled_schema.sql`.
