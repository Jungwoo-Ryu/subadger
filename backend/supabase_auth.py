"""Supabase GoTrue email/password sign-in for /v1/auth/login (HTTP only — no supabase-py import chain)."""

from __future__ import annotations

import os
import re
from uuid import UUID

import httpx
from fastapi import HTTPException

from schemas import LoginResponse


def resolve_supabase_url() -> str:
    u = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if u:
        return u
    for key in ("DATABASE_URL", "SUPABASE_DB_URL"):
        raw = os.getenv(key, "") or ""
        m = re.search(r"db\.([a-z0-9]+)\.supabase\.co", raw, re.I)
        if m:
            return f"https://{m.group(1)}.supabase.co"
    return ""


def sign_in_with_supabase(email: str, password: str) -> LoginResponse | None:
    """
    If SUPABASE_ANON_KEY is set and URL is known (env or inferred from DATABASE_URL),
    verify credentials against auth.users and return JWT + user id.
    Returns None if Supabase is not configured (caller uses demo login).
    """
    base = resolve_supabase_url()
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not base or not key:
        return None

    token_url = f"{base}/auth/v1/token"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {"email": email.strip().lower(), "password": password}

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                token_url,
                params={"grant_type": "password"},
                json=payload,
                headers=headers,
            )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Supabase Auth unreachable: {e}",
        ) from e

    if r.status_code == 200:
        data = r.json()
        token = data.get("access_token") or ""
        user = data.get("user") or {}
        uid = user.get("id")
        if not token or not uid:
            raise HTTPException(
                status_code=500,
                detail="Supabase returned 200 but missing access_token or user.id",
            )
        return LoginResponse(
            user_id=uid if isinstance(uid, UUID) else UUID(str(uid)),
            access_token=token,
        )

    # 4xx / 5xx from GoTrue
    try:
        err = r.json()
        msg = err.get("error_description") or err.get("msg") or err.get("error") or r.text
    except Exception:
        msg = r.text or r.reason_phrase
    raise HTTPException(status_code=401, detail=str(msg)[:500] or "Invalid credentials")
