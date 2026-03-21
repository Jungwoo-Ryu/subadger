import os
from functools import lru_cache


@lru_cache
def get_settings():
    """Load from environment (see repo root .env)."""
    return {
        "database_url": os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL"),
        "cors_origins": os.getenv("CORS_ORIGINS", "*").split(","),
        "allowed_email_suffix": os.getenv("ALLOWED_EMAIL_SUFFIX", "@wisc.edu").strip().lower(),
    }
