import threading

import psycopg.errors
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from db import connection
from listing_sql import LISTING_DISPLAY_TITLE
from schemas import SuperLikeListItem, SuperLikeListResponse, SuperLikeRequest, SuperLikeResponse

router = APIRouter(prefix="/v1", tags=["super-like"])

_super_likes_lock = threading.Lock()
_super_likes_ready: bool | None = None


def _invalidate_super_likes_cache() -> None:
    global _super_likes_ready
    with _super_likes_lock:
        _super_likes_ready = None


def _super_likes_table_exists(cur) -> bool:
    """False until `super_likes` is created (e.g. 20260410 / production_catchup migration)."""
    global _super_likes_ready
    if _super_likes_ready is not None:
        return _super_likes_ready
    with _super_likes_lock:
        if _super_likes_ready is None:
            cur.execute(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'super_likes'
                ) AS ok
                """
            )
            row = cur.fetchone()
            # dict_row: single boolean column; avoid relying on exact key name
            _super_likes_ready = bool(row and next(iter(row.values())))
        return _super_likes_ready


def _fetch_super_like_rows(cur, user_id: str, *, received: bool) -> list:
    """Return rows or [] if `public.super_likes` is missing (stale cache, wrong DB, etc.)."""
    if received:
        profile_join = "p.id = s.sender_id"
        where = "s.recipient_id = %s::uuid"
    else:
        profile_join = "p.id = s.recipient_id"
        where = "s.sender_id = %s::uuid"
    try:
        cur.execute(
            f"""
            SELECT
              s.id AS super_like_id,
              s.listing_id,
              s.body,
              s.created_at,
              {LISTING_DISPLAY_TITLE} AS title,
              l.address,
              l.price_monthly,
              p.display_name AS counterparty_name
            FROM public.super_likes s
            JOIN public.listings l ON l.id = s.listing_id
            JOIN public.profiles p ON {profile_join}
            WHERE {where}
            ORDER BY s.created_at DESC
            LIMIT 50
            """,
            (str(user_id),),
        )
        return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        _invalidate_super_likes_cache()
        return []


@router.post("/swipe/super-like", response_model=SuperLikeResponse)
def super_like(body: SuperLikeRequest):
    """One super-like per sender per UTC day (DB unique index)."""
    with connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT host_id FROM listings WHERE id = %s AND status = 'active'
                    """,
                    (str(body.listing_id),),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Listing not found")
                host_id = row["host_id"]
                if str(host_id) == str(body.user_id):
                    raise HTTPException(status_code=400, detail="Cannot super-like own listing")

                if not _super_likes_table_exists(cur):
                    return SuperLikeResponse(
                        ok=False,
                        message=(
                            "Super likes are not available until the database migration is applied "
                            "(public.super_likes). Run supabase/migrations/20260411200000_production_catchup_meeting_backlog.sql "
                            "in the SQL Editor, then redeploy."
                        ),
                    )

                try:
                    cur.execute(
                        """
                        INSERT INTO public.super_likes (sender_id, recipient_id, listing_id, body)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (str(body.user_id), str(host_id), str(body.listing_id), body.body.strip()),
                    )
                except psycopg.errors.UndefinedTable:
                    conn.rollback()
                    _invalidate_super_likes_cache()
                    return SuperLikeResponse(
                        ok=False,
                        message=(
                            "Super likes table is missing. Apply "
                            "supabase/migrations/20260411200000_production_catchup_meeting_backlog.sql "
                            "in Supabase SQL Editor, then retry."
                        ),
                    )
                conn.commit()
        except psycopg.errors.UniqueViolation:
            conn.rollback()
            return SuperLikeResponse(
                ok=False,
                message="Super like already used today (resets at UTC midnight).",
            )
        except HTTPException:
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise
    return SuperLikeResponse(ok=True, message=None)


@router.get("/super-likes/received", response_model=SuperLikeListResponse)
def list_super_likes_received(user_id: UUID = Query(...)):
    """Host (or listing owner) sees super-likes on their listings."""
    with connection() as conn:
        with conn.cursor() as cur:
            if not _super_likes_table_exists(cur):
                return SuperLikeListResponse(items=[])
            rows = _fetch_super_like_rows(cur, str(user_id), received=True)
    items = [
        SuperLikeListItem(
            super_like_id=r["super_like_id"],
            listing_id=r["listing_id"],
            title=r["title"] or "",
            address=r["address"],
            price_monthly=r["price_monthly"],
            body=r["body"],
            counterparty_name=r["counterparty_name"],
            created_at=r["created_at"],
        )
        for r in rows
    ]
    return SuperLikeListResponse(items=items)


@router.get("/super-likes/sent", response_model=SuperLikeListResponse)
def list_super_likes_sent(user_id: UUID = Query(...)):
    """Seeker: super-likes they sent."""
    with connection() as conn:
        with conn.cursor() as cur:
            if not _super_likes_table_exists(cur):
                return SuperLikeListResponse(items=[])
            rows = _fetch_super_like_rows(cur, str(user_id), received=False)
    items = [
        SuperLikeListItem(
            super_like_id=r["super_like_id"],
            listing_id=r["listing_id"],
            title=r["title"] or "",
            address=r["address"],
            price_monthly=r["price_monthly"],
            body=r["body"],
            counterparty_name=r["counterparty_name"],
            created_at=r["created_at"],
        )
        for r in rows
    ]
    return SuperLikeListResponse(items=items)
