import os
from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException

from schemas import LoginRequest, LoginResponse
from supabase_auth import sign_in_with_supabase

router = APIRouter(prefix="/v1", tags=["auth"])


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


def _first_profile_id() -> UUID:
    from db import connection

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM public.profiles
                ORDER BY created_at ASC NULLS LAST
                LIMIT 1
                """
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=500,
            detail="No rows in public.profiles; create a profile or set AUTH_DEMO_USER_ID",
        )
    raw = row["id"]
    return raw if isinstance(raw, UUID) else UUID(str(raw))


def _normalize_login_id(raw: str) -> str:
    e = raw.strip().lower()
    if e == "system":
        return "system@wisc.edu"
    return e


def _demo_login(email: str, password: str) -> LoginResponse:
    """Env-based demo when Supabase Auth is not configured."""
    demo_email = os.getenv("AUTH_DEMO_EMAIL", "system@wisc.edu").strip().lower()
    demo_password = os.getenv("AUTH_DEMO_PASSWORD", "system")
    demo_uid = os.getenv("AUTH_DEMO_USER_ID", "").strip()

    if email != demo_email or password != demo_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if demo_uid:
        try:
            uid = UUID(demo_uid)
        except ValueError as e:
            raise HTTPException(
                status_code=500, detail="AUTH_DEMO_USER_ID must be a valid UUID"
            ) from e
    elif _env_flag("AUTH_DEMO_AUTO_FIRST_PROFILE"):
        fallback = os.getenv("AUTH_DEMO_USER_ID", "").strip()
        try:
            uid = _first_profile_id()
        except psycopg.OperationalError as e:
            if fallback:
                try:
                    uid = UUID(fallback)
                except ValueError as ve:
                    raise HTTPException(
                        status_code=500,
                        detail="AUTH_DEMO_USER_ID must be a valid UUID (used when DB is unreachable)",
                    ) from ve
            else:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Database unreachable and no AUTH_DEMO_USER_ID fallback. "
                        "Paste a profiles.id UUID from Supabase (Table editor) into "
                        "AUTH_DEMO_USER_ID in .env — login will work; fix DATABASE_URL for feed/swipe."
                    ),
                ) from e
    else:
        raise HTTPException(
            status_code=500,
            detail=(
                "AUTH_DEMO_USER_ID is not set. Add it to .env, or set "
                "AUTH_DEMO_AUTO_FIRST_PROFILE=1 to use the first row in public.profiles."
            ),
        )

    return LoginResponse(
        user_id=uid,
        access_token="mvp-demo-token",
    )


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest):
    """
    If SUPABASE_ANON_KEY (+ URL from SUPABASE_URL or inferred from DATABASE_URL) is set,
    validates against Supabase Auth (auth.users). Otherwise uses env demo credentials.
    """
    email = _normalize_login_id(body.email)

    supa = sign_in_with_supabase(email, body.password)
    if supa is not None:
        return supa

    return _demo_login(email, body.password)
