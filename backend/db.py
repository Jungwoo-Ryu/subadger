from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Generator
from urllib.parse import quote, unquote

import psycopg
from psycopg.rows import dict_row


def _normalize_postgres_uri(url: str) -> str:
    """
    Percent-encode user/password so reserved chars (e.g. ! @ : #) do not break
    host parsing (psycopg/libpq). Idempotent if already encoded.
    """
    raw = url.strip()
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            scheme = prefix.rstrip("://")
            rest = raw[len(prefix) :]
            break
    else:
        return raw

    path = ""
    if "/" in rest:
        cut = rest.index("/")
        authority, path = rest[:cut], rest[cut:]
    else:
        authority = rest

    if "@" not in authority:
        return raw

    userinfo, hostport = authority.rsplit("@", 1)
    if not hostport.strip():
        return raw

    user, sep, password = userinfo.partition(":")
    if not sep:
        user_enc = quote(unquote(user), safe="")
        return f"{scheme}://{user_enc}@{hostport}{path}"

    user_enc = quote(unquote(user), safe="")
    password_enc = quote(unquote(password), safe="")
    return f"{scheme}://{user_enc}:{password_enc}@{hostport}{path}"


def _ensure_supabase_ssl(url: str) -> str:
    """Supabase cloud Postgres expects TLS; local URLs are unchanged."""
    if "supabase.co" not in url and "pooler.supabase.com" not in url:
        return url
    if "sslmode=" in url:
        return url
    join = "&" if "?" in url else "?"
    return f"{url}{join}sslmode=require"


def dsn() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL is required")
    return _ensure_supabase_ssl(_normalize_postgres_uri(url))


@contextmanager
def connection() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(dsn(), row_factory=dict_row) as conn:
        yield conn
