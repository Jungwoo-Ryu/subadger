import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from features.auth.email import router as auth_email_router
from features.auth.login import router as auth_login_router
from features.chat.router import router as chat_router
from features.feed.router import router as feed_router
from features.feed_stack.router import router as feed_stack_router
from features.likes.router import router as likes_router
from features.listings.router import router as listings_router
from features.profiles.router import router as profiles_router
from features.super_like.router import router as super_like_router
from features.swipe.router import router as swipe_router

# 저장소 루트의 .env (backend/에서 uvicorn 실행해도 읽힘)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db_init import ensure_schema

    try:
        ensure_schema()
    except Exception:
        logger.exception("Startup schema bootstrap failed")
        raise
    yield


app = FastAPI(
    title="Subadger API",
    version="1.1.0",
    lifespan=lifespan,
)

_origins = os.getenv("CORS_ORIGINS", "*")
_cors = [o.strip() for o in _origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors if _cors != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feed_router)
app.include_router(swipe_router)
app.include_router(super_like_router)
app.include_router(feed_stack_router)
app.include_router(likes_router)
app.include_router(chat_router)
app.include_router(profiles_router)
app.include_router(listings_router)
app.include_router(auth_email_router)
app.include_router(auth_login_router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Subadger API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


_EMAIL_CONFIRMED_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email confirmed</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1.25rem;
           line-height: 1.5; color: #1c1917; }
    h1 { font-size: 1.35rem; color: #b91c1c; }
    p { color: #57534e; }
    code { font-size: 0.85rem; background: #f5f5f4; padding: 0.15rem 0.35rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Email confirmed</h1>
  <p>Your account is verified. You can close this tab and return to the <strong>SubLease Match</strong> app, then sign in.</p>
  <p>If the app does not open automatically, open it manually and log in with the same email and password.</p>
</body>
</html>"""


@app.get("/auth/email-confirmed", response_class=HTMLResponse)
def auth_email_confirmed():
    """
    Landing page after Supabase email confirmation (signUp emailRedirectTo).
    Add this full URL under Supabase → Authentication → URL Configuration → Redirect URLs.
    """
    return HTMLResponse(content=_EMAIL_CONFIRMED_HTML)


@app.get("/auth/confirm", response_class=HTMLResponse)
def auth_confirm_alias():
    """Alias for shorter links or older configs."""
    return HTMLResponse(content=_EMAIL_CONFIRMED_HTML)
