"""
Vercel FastAPI entry when the Git / Vercel project root is the repository root.

Prefer setting Vercel Root Directory to `backend` and deploying from there (uses `backend/main.py` via pyproject).
"""

from __future__ import annotations

import sys
from pathlib import Path

_backend = Path(__file__).resolve().parent / "backend"
if _backend.is_dir():
    sys.path.insert(0, str(_backend))

from main import app  # noqa: E402

__all__ = ["app"]
