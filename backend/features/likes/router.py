from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from db import connection
from listing_sql import LISTING_DISPLAY_TITLE
from schemas import (
    InterestRespondRequest,
    InterestRespondResponse,
    LikeListItem,
    LikeListResponse,
)

router = APIRouter(prefix="/v1/likes", tags=["likes"])

# DB CHECK allows body or image; empty visible like uses ZWSP so trim-based CHECK passes.
_EMPTY_LIKE_SEED = "\u200b"


_BASE_SQL = """
  SELECT
    i.id AS interest_id,
    i.listing_id,
    {listing_title} AS title,
    l.address,
    l.price_monthly,
    i.state,
    i.body AS note,
    i.created_at,
    (SELECT lp.url FROM listing_photos lp
     WHERE lp.listing_id = l.id
     ORDER BY lp.sort_order, lp.id LIMIT 1) AS photo_url,
    cp.display_name AS counterparty_name,
    conv.id AS conversation_id
  FROM interests i
  JOIN listings l ON l.id = i.listing_id
  JOIN profiles cp ON cp.id = {cp_join}
  LEFT JOIN matches mat ON mat.listing_id = i.listing_id
    AND mat.user_one = LEAST(i.sender_id, i.recipient_id)
    AND mat.user_two = GREATEST(i.sender_id, i.recipient_id)
  LEFT JOIN conversations conv ON conv.match_id = mat.id
  WHERE i.{where_uid} = %s::uuid
    AND i.state IN ('pending', 'accepted')
  ORDER BY i.created_at DESC
  LIMIT %s
"""


def _conversation_for_pair(cur, listing_id, sender_id, recipient_id):
    u1, u2 = sorted([str(sender_id), str(recipient_id)])
    cur.execute(
        """
        SELECT c.id AS conversation_id, m.id AS match_id
        FROM conversations c
        JOIN matches m ON m.id = c.match_id
        WHERE m.listing_id = %s
          AND m.user_one = %s::uuid AND m.user_two = %s::uuid
        LIMIT 1
        """,
        (str(listing_id), u1, u2),
    )
    return cur.fetchone()


def _seed_opener_message(cur, conversation_id, sender_id, note: str | None):
    cur.execute(
        "SELECT COUNT(*)::int AS c FROM messages WHERE conversation_id = %s",
        (str(conversation_id),),
    )
    if cur.fetchone()["c"] > 0:
        return
    text = (note or "").strip()
    if not text:
        text = _EMPTY_LIKE_SEED
    cur.execute(
        """
        INSERT INTO messages (conversation_id, sender_id, body)
        VALUES (%s, %s, %s)
        """,
        (str(conversation_id), str(sender_id), text),
    )


@router.get("/sent", response_model=LikeListResponse)
def likes_sent(
    user_id: UUID = Query(...),
    limit: int = Query(50, ge=1, le=100),
):
    sql = _BASE_SQL.format(
        listing_title=LISTING_DISPLAY_TITLE,
        cp_join="i.recipient_id",
        where_uid="sender_id",
    )
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (str(user_id), limit))
            rows = cur.fetchall()
    items = [
        LikeListItem(
            interest_id=r["interest_id"],
            listing_id=r["listing_id"],
            title=r["title"] or "",
            address=r["address"],
            price_monthly=r["price_monthly"],
            photo_url=r.get("photo_url"),
            counterparty_name=r["counterparty_name"],
            state=r["state"],
            note=r.get("note"),
            created_at=r["created_at"],
            conversation_id=r.get("conversation_id"),
        )
        for r in rows
    ]
    return LikeListResponse(items=items)


@router.get("/received", response_model=LikeListResponse)
def likes_received(
    user_id: UUID = Query(...),
    limit: int = Query(50, ge=1, le=100),
):
    sql = _BASE_SQL.format(
        listing_title=LISTING_DISPLAY_TITLE,
        cp_join="i.sender_id",
        where_uid="recipient_id",
    )
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (str(user_id), limit))
            rows = cur.fetchall()
    items = [
        LikeListItem(
            interest_id=r["interest_id"],
            listing_id=r["listing_id"],
            title=r["title"] or "",
            address=r["address"],
            price_monthly=r["price_monthly"],
            photo_url=r.get("photo_url"),
            counterparty_name=r["counterparty_name"],
            state=r["state"],
            note=r.get("note"),
            created_at=r["created_at"],
            conversation_id=r.get("conversation_id"),
        )
        for r in rows
    ]
    return LikeListResponse(items=items)


@router.post("/{interest_id}/respond", response_model=InterestRespondResponse)
def respond_to_interest(interest_id: UUID, body: InterestRespondRequest):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, sender_id, recipient_id, listing_id, body, state
                FROM interests WHERE id = %s
                """,
                (str(interest_id),),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Interest not found")
            if str(row["recipient_id"]) != str(body.user_id):
                raise HTTPException(status_code=403, detail="Only the recipient can respond")
            state = row["state"]
            if state == "declined":
                raise HTTPException(status_code=400, detail="Already declined")
            if state == "cancelled":
                raise HTTPException(status_code=400, detail="Interest cancelled")

            if state == "accepted":
                hit = _conversation_for_pair(
                    cur, row["listing_id"], row["sender_id"], row["recipient_id"]
                )
                if not hit:
                    raise HTTPException(status_code=409, detail="Accepted but chat not found")
                conn.commit()
                return InterestRespondResponse(
                    ok=True,
                    conversation_id=hit["conversation_id"],
                    match_id=hit["match_id"],
                )

            if state != "pending":
                raise HTTPException(status_code=400, detail="Invalid interest state")

            if body.action == "decline":
                cur.execute(
                    """
                    UPDATE interests SET state = 'declined', updated_at = now()
                    WHERE id = %s
                    """,
                    (str(interest_id),),
                )
                conn.commit()
                return InterestRespondResponse(ok=True)

            # accept
            sender_id = row["sender_id"]
            recipient_id = row["recipient_id"]
            listing_id = row["listing_id"]
            u1, u2 = sorted([str(sender_id), str(recipient_id)])

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
                raise HTTPException(status_code=500, detail="Failed to create match")
            match_id = m["id"]

            cur.execute(
                """
                INSERT INTO conversations (match_id) VALUES (%s)
                ON CONFLICT (match_id) DO NOTHING
                RETURNING id
                """,
                (str(match_id),),
            )
            c = cur.fetchone()
            if not c:
                cur.execute(
                    "SELECT id FROM conversations WHERE match_id = %s",
                    (str(match_id),),
                )
                c = cur.fetchone()
            if not c:
                raise HTTPException(status_code=500, detail="Failed to create conversation")
            conv_id = c["id"]

            _seed_opener_message(cur, conv_id, sender_id, row.get("body"))

            cur.execute(
                """
                UPDATE interests SET state = 'accepted', updated_at = now()
                WHERE id = %s
                """,
                (str(interest_id),),
            )
            conn.commit()

    return InterestRespondResponse(
        ok=True,
        conversation_id=conv_id,
        match_id=match_id,
    )
