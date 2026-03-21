# Subadger — AI Coding Guidelines

## Project Overview

Monorepo: **FastAPI** (`backend/`), **React Native / Expo** (`mobile/`), **Supabase** (`supabase/`).

## Architecture

- **API:** `backend/main.py` — FastAPI app, `backend/requirements.txt`
- **Mobile:** `mobile/` — Expo app (see `mobile/README.md` for scaffolding)
- **DB:** `supabase/migrations/` — Postgres schema; RLS + Realtime on `messages`
- **Docker:** Root `Dockerfile` copies `backend/` and `supabase/migrations` into image
- **Env:** Repository root `.env` loaded by `backend/main.py`

## Code Organization

- Add API routes in `backend/main.py` or new modules under `backend/`
- Do not put secrets in `mobile/` — use `EXPO_PUBLIC_*` for anon-safe keys only
- Service role / `DATABASE_URL` stay server-side or local `.env` only

## Local Development

```bash
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Optional: `npm run api` from repo root.

## Deployment

- Build: `docker build -t thugken/subadger .` (from repo root)
- `docker-compose` pulls `thugken/subadger:latest` per `docker-compose.yml`
