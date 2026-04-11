from __future__ import annotations

import os
import socket
from contextlib import contextmanager
from typing import Generator
from urllib.parse import quote, unquote

import psycopg
from psycopg.rows import dict_row


def _postgres_host_from_uri(url: str) -> str | None:
    """Return hostname from postgresql://user:pass@host:port/db or None if missing."""
    raw = url.strip()
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            rest = raw[len(prefix) :]
            break
    else:
        return None
    if "@" not in rest:
        return None
    hostport = rest.rsplit("@", 1)[1].split("/")[0].split("?")[0]
    if not hostport.strip():
        return None
    host = hostport.split(":")[0].strip()
    return host or None


def _postgres_host_port_from_uri(url: str) -> tuple[str | None, int]:
    host = _postgres_host_from_uri(url)
    if not host:
        return None, 5432
    raw = url.strip()
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            rest = raw[len(prefix) :]
            break
    else:
        return host, 5432
    if "@" not in rest:
        return host, 5432
    hostport = rest.rsplit("@", 1)[1].split("/")[0].split("?")[0]
    if ":" in hostport:
        try:
            return host, int(hostport.rsplit(":", 1)[-1])
        except ValueError:
            return host, 5432
    return host, 5432


def _vercel_prefer_ipv4_for_supabase_direct(url: str) -> str:
    """
    Vercel often cannot open TCP to Supabase direct DB over IPv6.
    If DNS has an A record, libpq can connect via hostaddr=IPv4 while host stays db.*.supabase.co (TLS SNI).
    Prefer Transaction pooler (6543) for serverless; this is a fallback when DATABASE_URL is still direct.
    """
    if not os.getenv("VERCEL"):
        return url
    low = url.lower()
    if "pooler.supabase.com" in low or ":6543" in url:
        return url
    if "hostaddr=" in low:
        return url
    host, port = _postgres_host_port_from_uri(url)
    if not host or not (host.startswith("db.") and host.endswith(".supabase.co")):
        return url
    if port != 5432:
        return url
    try:
        infos = socket.getaddrinfo(
            host,
            port,
            family=socket.AF_INET,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except OSError:
        return url
    if not infos:
        return url
    ipv4 = infos[0][4][0]
    join = "&" if "?" in url else "?"
    return f"{url}{join}hostaddr={ipv4}"


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
    if not url or not str(url).strip():
        raise RuntimeError(
            "DATABASE_URL or SUPABASE_DB_URL is required. "
            "Supabase: Project Settings → Database → copy URI into repo root .env"
        )
    normalized = _ensure_supabase_ssl(_normalize_postgres_uri(url.strip()))
    normalized = _vercel_prefer_ipv4_for_supabase_direct(normalized)
    host = _postgres_host_from_uri(normalized)
    if not host:
        raise RuntimeError(
            "DATABASE_URL has no hostname (DNS error 'nodename nor servname' often means this). "
            "Use the full URI from Supabase, e.g. postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
        )
    return normalized


def _pooler_hint_for_operational_error(exc: BaseException) -> str | None:
    """Vercel/serverless often cannot open IPv6 to direct db.*.supabase.co:5432."""
    s = str(exc)
    low = s.lower()
    if "pooler.supabase.com" in low or ":6543" in s:
        return None
    if "cannot assign requested address" not in low and "connection is bad" not in low:
        return None
    if "supabase" not in low and "2600:" not in s and "2a05:" not in s:
        return None
    return (
        " On Vercel/serverless, set DATABASE_URL to the Supabase Transaction pooler URI "
        "(Dashboard → Database → Connection string → Transaction pooler, port 6543, …pooler.supabase.com)."
    )


@contextmanager
def connection() -> Generator[psycopg.Connection, None, None]:
    try:
        with psycopg.connect(dsn(), row_factory=dict_row) as conn:
            yield conn
    except psycopg.OperationalError as e:
        hint = _pooler_hint_for_operational_error(e)
        if hint:
            raise psycopg.OperationalError(f"{e}{hint}") from e
        raise
