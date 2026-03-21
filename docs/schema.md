# DB schema (Supabase / Postgres)

Canonical SQL: [`supabase/migrations/20260320000000_roomie_schema.sql`](../supabase/migrations/20260320000000_roomie_schema.sql).

## Tables (public)

| Table | Purpose |
|-------|---------|
| `profiles` | One row per `auth.users`; `role` ∈ `seeker` \| `host`; display name & avatar. |
| `seeker_profiles` | Seeker prefs: budget range, stay window, optional prefs JSON. |
| `listings` | Host listing; partial unique index **one `active` listing per host**. |
| `listing_photos` | Ordered photo URLs per listing. |
| `interests` | Like/interest + optional ≤50 char `body`; `state` pending/accepted/declined/cancelled. |
| `matches` | Matched pair (`user_one` < `user_two`) + optional `listing_id`. |
| `conversations` | 1:1 with `matches` (text chat). |
| `messages` | Chat rows; added to `supabase_realtime` publication. |
| `feed_passes` | Swipe passes (`target_kind` listing \| user) for feed ranking. |

## Auth

- `profiles.id` references **`auth.users(id)`** (Supabase Auth).
- RLS enabled; FastAPI with **service role** key bypasses RLS for server-side writes.

## Apply migrations

- **Supabase CLI:** `supabase db push` (or link remote and push).
- **API container:** set `DATABASE_URL`, ensure `psql` is available (Dockerfile installs `postgresql-client`). On startup, if `public.profiles` is missing, `db_init.ensure_schema()` runs `sql/migration.sql`.

Set `SKIP_SCHEMA_INIT=1` to disable automatic bootstrap (e.g. CI or when migrations are applied elsewhere).
