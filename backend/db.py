"""
PostgreSQL 접속: DATABASE_URL / SUPABASE_DB_URL.

Vercel 서버리스에서는 Supabase 직접 호스트(db.*.supabase.co:5432)가 IPv6로만 풀리는 경우가 많아
연결이 실패한다. 그 환경에서는 Transaction pooler(…pooler.supabase.com:6543)만 허용한다.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Generator
from urllib.parse import quote, unquote, urlparse

import psycopg
from psycopg.rows import dict_row

_DEFAULT_PG_PORT = 5432
_SUPABASE_POOLER_PORT = 6543

_ERR_MISSING_URL = (
    "DATABASE_URL 또는 SUPABASE_DB_URL이 필요합니다. "
    "Supabase: Project Settings → Database 에서 URI를 복사해 환경 변수에 넣으세요."
)
_ERR_BAD_HOST = (
    "DATABASE_URL에서 호스트를 읽을 수 없습니다. "
    "비밀번호에 @가 있으면 URL 인코딩(%40)되도록 전체 URI를 다시 확인하세요."
)
_ERR_VERCEL_NEED_POOLER = (
    "Vercel에서는 Supabase Transaction pooler URI가 필요합니다. "
    "직접 연결(db.<ref>.supabase.co:5432)은 IPv6 문제로 실패하는 경우가 많습니다. "
    "Supabase Dashboard → Database → Connection string → Transaction pooler "
    f"(호스트 …pooler.supabase.com, 포트 {_SUPABASE_POOLER_PORT}, 사용자 postgres.<project-ref> 등)를 "
    "Vercel 환경 변수에 넣고 Redeploy 하세요."
)


def _running_on_vercel() -> bool:
    """
    Vercel Python 함수는 보통 /var/task 에 풀리지만, VERCEL_* 환경 변수가 비어 있는 경우가 있다.
    Lambda 호환 변수와 작업 디렉터리로 보강한다.
    """
    markers = (
        "VERCEL",
        "VERCEL_ENV",
        "VERCEL_REGION",
        "VERCEL_URL",
        "VERCEL_DEPLOYMENT_ID",
        "VERCEL_PROJECT_ID",
    )
    if any(os.getenv(k) for k in markers):
        return True
    try:
        here = os.path.abspath(__file__).replace("\\", "/")
    except NameError:
        here = ""
    if "/var/task/" in here:
        return True
    try:
        cwd = os.getcwd().replace("\\", "/")
    except OSError:
        cwd = ""
    if cwd == "/var/task" or cwd.startswith("/var/task/"):
        return True
    if os.getenv("AWS_LAMBDA_FUNCTION_NAME") and (
        "/var/task/" in here or cwd.startswith("/var/task")
    ):
        return True
    return False


def _host_port(url: str) -> tuple[str | None, int]:
    """libpq에 넘기기 전 URI에서 호스트·포트만 추출 (urlparse 기준)."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or _DEFAULT_PG_PORT
        return host, port
    except ValueError:
        return None, _DEFAULT_PG_PORT


def _normalize_postgres_uri(url: str) -> str:
    """user/password 내 특수문자를 퍼센트 인코딩해 libpq 파싱이 깨지지 않게 한다."""
    raw = url.strip()
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            scheme = "postgresql" if prefix == "postgresql://" else "postgres"
            rest = raw[len(prefix) :]
            break
    else:
        return raw

    if "/" in rest:
        cut = rest.index("/")
        authority, path = rest[:cut], rest[cut:]
    else:
        authority, path = rest, ""

    if "@" not in authority:
        return raw

    userinfo, hostport = authority.rsplit("@", 1)
    if not hostport.strip():
        return raw

    user, sep, password = userinfo.partition(":")
    if not sep:
        user_enc = quote(unquote(userinfo), safe="")
        return f"{scheme}://{user_enc}@{hostport}{path}"

    user_enc = quote(unquote(user), safe="")
    password_enc = quote(unquote(password), safe="")
    return f"{scheme}://{user_enc}:{password_enc}@{hostport}{path}"


def _append_sslmode_require(url: str) -> str:
    if "supabase.co" not in url and "pooler.supabase.com" not in url:
        return url
    if "sslmode=" in url:
        return url
    join = "&" if "?" in url else "?"
    return f"{url}{join}sslmode=require"


def _reject_supabase_direct_on_vercel(url: str) -> None:
    if not _running_on_vercel():
        return
    host, port = _host_port(url)
    if not host:
        return
    h = host.lower()
    if "pooler.supabase.com" in h:
        return
    if port == _SUPABASE_POOLER_PORT:
        return
    if port != _DEFAULT_PG_PORT:
        return
    if not h.endswith(".supabase.co"):
        return
    raise RuntimeError(_ERR_VERCEL_NEED_POOLER)


def _connection_hint(exc: BaseException) -> str | None:
    """이미 잘못된 URL로 연결을 시도한 뒤 나는 오류에 덧붙일 안내."""
    text = str(exc)
    low = text.lower()
    if "pooler.supabase.com" in low:
        return None
    if "cannot assign requested address" not in low and "connection is bad" not in low:
        return None
    if "supabase" not in low and "2600:" not in text and "2a05:" not in text:
        return None
    return (
        " Vercel/serverless에서는 DATABASE_URL을 Supabase Transaction pooler로 두세요 "
        f"(포트 {_SUPABASE_POOLER_PORT}, …pooler.supabase.com)."
    )


def dsn() -> str:
    raw = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or "").strip()
    if not raw:
        raise RuntimeError(_ERR_MISSING_URL)

    url = _append_sslmode_require(_normalize_postgres_uri(raw))
    _reject_supabase_direct_on_vercel(url)

    host, _ = _host_port(url)
    if not host:
        raise RuntimeError(_ERR_BAD_HOST)

    return url


@contextmanager
def connection() -> Generator[psycopg.Connection, None, None]:
    try:
        with psycopg.connect(dsn(), row_factory=dict_row) as conn:
            yield conn
    except psycopg.OperationalError as e:
        hint = _connection_hint(e)
        if hint:
            raise psycopg.OperationalError(f"{e}{hint}") from e
        raise
