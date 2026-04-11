import psycopg.errors
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from db import connection
from listing_sql import LISTING_DISPLAY_TITLE
from schemas import SuperLikeListItem, SuperLikeListResponse, SuperLikeRequest, SuperLikeResponse

router = APIRouter(prefix="/v1", tags=["super-like"])


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

                cur.execute(
                    """
                    INSERT INTO super_likes (sender_id, recipient_id, listing_id, body)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (str(body.user_id), str(host_id), str(body.listing_id), body.body.strip()),
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
                FROM super_likes s
                JOIN listings l ON l.id = s.listing_id
                JOIN profiles p ON p.id = s.sender_id
                WHERE s.recipient_id = %s::uuid
                ORDER BY s.created_at DESC
                LIMIT 50
                """,
                (str(user_id),),
            )
            rows = cur.fetchall()
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
                FROM super_likes s
                JOIN listings l ON l.id = s.listing_id
                JOIN profiles p ON p.id = s.recipient_id
                WHERE s.sender_id = %s::uuid
                ORDER BY s.created_at DESC
                LIMIT 50
                """,
                (str(user_id),),
            )
            rows = cur.fetchall()
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
