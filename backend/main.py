import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

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


@app.get("/")
def root():
    return {"status": "ok", "message": "Subadger API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
