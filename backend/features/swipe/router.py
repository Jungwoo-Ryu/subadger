from uuid import UUID

import psycopg.errors
from fastapi import APIRouter, HTTPException

from db import connection
from schemas import SwipeRequest, SwipeResponse

router = APIRouter(prefix="/v1", tags=["swipe"])


@router.post("/swipe", response_model=SwipeResponse)
def swipe(body: SwipeRequest):
    """
    Record pass or send a one-sided like (pending interest).
    Match + chat are created only when the recipient accepts (see POST /v1/likes/.../respond).
    """
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

                if body.recipient_user_id is not None:
                    # Host swiping on a seeker card (listing = host's property for context).
                    if str(host_id) != str(body.user_id):
                        raise HTTPException(
                            status_code=400,
                            detail="listing_id must belong to swiper when recipient_user_id is set",
                        )
                    if str(body.recipient_user_id) == str(body.user_id):
                        raise HTTPException(status_code=400, detail="Cannot swipe yourself")
                    sender_id = body.user_id
                    recipient_id = body.recipient_user_id
                else:
                    # Seeker swiping on a listing.
                    if str(host_id) == str(body.user_id):
                        raise HTTPException(status_code=400, detail="Cannot swipe own listing")
                    sender_id = body.user_id
                    recipient_id = host_id

                if body.action == "pass":
                    if body.recipient_user_id is not None:
                        cur.execute(
                            """
                            INSERT INTO feed_passes (swiper_id, target_kind, target_id)
                            VALUES (%s, 'user', %s)
                            ON CONFLICT (swiper_id, target_kind, target_id) DO NOTHING
                            """,
                            (str(body.user_id), str(body.recipient_user_id)),
                        )
                    else:
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
                        (str(sender_id), str(recipient_id), str(body.listing_id), body_text),
                    )
                except psycopg.errors.UniqueViolation:
                    conn.rollback()
                    return SwipeResponse(ok=True)

                conn.commit()
        except HTTPException:
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise
    return SwipeResponse(ok=True)
