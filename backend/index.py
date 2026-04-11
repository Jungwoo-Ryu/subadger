"""
Vercel FastAPI entrypoint.

Vercel looks for a module exposing `app` at app.py, index.py, or server.py — not main.py.
Local dev: keep using `uvicorn main:app`.
"""

from main import app

__all__ = ["app"]
