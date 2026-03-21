from uuid import UUID

import psycopg.errors
from fastapi import APIRouter, HTTPException

from db import connection
from schemas import SwipeRequest, SwipeResponse

router = APIRouter(prefix="/v1", tags=["swipe"])


def _create_match_and_chat(cur, user_id: UUID, host_id: UUID, listing_id: UUID, note: str | None):
    """When mutual pending interests exist, create match + conversation + optional first message."""
    u1, u2 = sorted([str(user_id), str(host_id)])
    cur.execute(
        """
        INSERT INTO matches (user_one, user_two, listing_id)
        VALUES (%s::uuid, %s::uuid, %s)
        ON CONFLICT (user_one, user_two) DO NOTHING
        RETURNING id
        """,
        (u1, u2, str(listing_id)),
    )
    m = cur.fetchone()
    if not m:
        cur.execute(
            "SELECT id FROM matches WHERE user_one = %s::uuid AND user_two = %s::uuid",
            (u1, u2),
        )
        m = cur.fetchone()
    if not m:
        return
    match_id = m["id"]

    cur.execute(
        """
        UPDATE interests SET state = 'accepted', updated_at = now()
        WHERE listing_id = %s AND state = 'pending'
          AND (
            (sender_id = %s::uuid AND recipient_id = %s::uuid)
            OR (sender_id = %s::uuid AND recipient_id = %s::uuid)
          )
        """,
        (str(listing_id), str(user_id), str(host_id), str(host_id), str(user_id)),
    )

    cur.execute(
        """
        INSERT INTO conversations (match_id) VALUES (%s)
        ON CONFLICT (match_id) DO NOTHING
        RETURNING id
        """,
        (str(match_id),),
    )
    conv = cur.fetchone()
    if not conv:
        cur.execute(
            "SELECT id FROM conversations WHERE match_id = %s",
            (str(match_id),),
        )
        conv = cur.fetchone()
    if not conv:
        return

    first = (note or "").strip()
    if first:
        cur.execute(
            """
            INSERT INTO messages (conversation_id, sender_id, body)
            VALUES (%s, %s, %s)
            """,
            (str(conv["id"]), str(user_id), first),
        )


@router.post("/swipe", response_model=SwipeResponse)
def swipe(body: SwipeRequest):
    with connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT host_id FROM listings WHERE id = %s AND status = 'active'",
                    (str(body.listing_id),),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Listing not found")
                host_id = row["host_id"]
                if str(host_id) == str(body.user_id):
                    raise HTTPException(status_code=400, detail="Cannot swipe own listing")

                if body.action == "pass":
                    cur.execute(
                        """
                        INSERT INTO feed_passes (swiper_id, target_kind, target_id)
                        VALUES (%s, 'listing', %s)
                        ON CONFLICT (swiper_id, target_kind, target_id) DO NOTHING
                        """,
                        (str(body.user_id), str(body.listing_id)),
                    )
                    conn.commit()
                    return SwipeResponse(ok=True)

                body_text = (body.body or "").strip() or None
                if body_text and len(body_text) > 50:
                    raise HTTPException(status_code=400, detail="Note must be ≤ 50 characters")

                try:
                    cur.execute(
                        """
                        INSERT INTO interests (sender_id, recipient_id, listing_id, body, state)
                        VALUES (%s, %s, %s, %s, 'pending')
                        """,
                        (str(body.user_id), str(host_id), str(body.listing_id), body_text),
                    )
                except psycopg.errors.UniqueViolation:
                    conn.rollback()
                    return SwipeResponse(ok=True)

                cur.execute(
                    """
                    SELECT COUNT(*)::int AS c FROM interests
                    WHERE listing_id = %s AND state = 'pending'
                      AND (
                        (sender_id = %s::uuid AND recipient_id = %s::uuid)
                        OR (sender_id = %s::uuid AND recipient_id = %s::uuid)
                      )
                    """,
                    (
                        str(body.listing_id),
                        str(body.user_id),
                        str(host_id),
                        str(host_id),
                        str(body.user_id),
                    ),
                )
                cnt = cur.fetchone()["c"]
                if cnt >= 2:
                    _create_match_and_chat(
                        cur, body.user_id, host_id, body.listing_id, body_text
                    )

                conn.commit()
        except HTTPException:
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise
    return SwipeResponse(ok=True)
