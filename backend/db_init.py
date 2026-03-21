"""
Bootstrap public schema on first run (local / self-hosted Postgres with Supabase Auth).

- If `public.profiles` already exists, skip (idempotent).
- Otherwise runs the same SQL as `supabase/migrations/20260320000000_roomie_schema.sql`
  via `psql` (handles DO blocks / triggers reliably).

Requires `DATABASE_URL` or `SUPABASE_DB_URL` (libpq URI, e.g. postgresql://...).
Set `SKIP_SCHEMA_INIT=1` to disable.

Supabase hosted: prefer `supabase db push` / CI; this module is for dev or custom deploys.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def _repo_root() -> Path:
    """Monorepo root (parent of backend/)."""
    return Path(__file__).resolve().parent.parent


def _migration_sql_path() -> Path:
    """Resolve migration file (repo checkout or Docker image layout)."""
    here = Path(__file__).resolve().parent
    candidates = [
        _repo_root() / "supabase" / "migrations" / "20260320000000_roomie_schema.sql",
        here / "sql" / "migration.sql",
        Path("/app/sql/migration.sql"),
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError(
        "Could not find 20260320000000_roomie_schema.sql; "
        "expected supabase/migrations/ or backend/sql/migration.sql"
    )


def _profiles_table_exists(dsn: str) -> bool:
    import psycopg

    with psycopg.connect(dsn, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = 'profiles'
                );
                """
            )
            row = cur.fetchone()
            return bool(row and row[0])


def _run_psql_file(dsn: str, sql_path: Path) -> None:
    psql = shutil.which("psql")
    if not psql:
        raise RuntimeError(
            "`psql` not found on PATH. Install PostgreSQL client tools, "
            "or apply migrations manually: supabase db push"
        )
    subprocess.run(
        [psql, dsn, "-v", "ON_ERROR_STOP=1", "-f", str(sql_path)],
        check=True,
        env={**os.environ},
    )


def ensure_schema() -> None:
    if os.environ.get("SKIP_SCHEMA_INIT", "").lower() in ("1", "true", "yes"):
        logger.info("SKIP_SCHEMA_INIT set; skipping DB schema bootstrap.")
        return

    dsn = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        logger.warning(
            "DATABASE_URL / SUPABASE_DB_URL not set; skipping schema bootstrap."
        )
        return

    try:
        exists = _profiles_table_exists(dsn)
    except Exception as e:
        logger.warning("Could not probe DB (schema bootstrap skipped): %s", e)
        return

    if exists:
        logger.info("DB schema already present (public.profiles exists).")
        return

    sql_path = _migration_sql_path()
    logger.info("Applying initial schema from %s", sql_path)
    try:
        _run_psql_file(dsn, sql_path)
    except Exception as e:
        logger.exception("Schema bootstrap failed: %s", e)
        raise

    logger.info("Schema bootstrap finished.")
