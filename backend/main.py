import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.auth_email import router as auth_email_router
from routers.auth_login import router as auth_login_router
from routers.feed import router as feed_router
from routers.swipe import router as swipe_router

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
    version="1.0.0",
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
app.include_router(auth_email_router)
app.include_router(auth_login_router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Subadger API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
