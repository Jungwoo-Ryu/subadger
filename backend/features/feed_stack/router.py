from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from db import connection
from features.feed.service import fetch_listing_by_id
from schemas import FeedListing, FeedStackPopResponse, FeedStackPushRequest

router = APIRouter(prefix="/v1/feed/stack", tags=["feed-stack"])


def _as_uuid_list(raw) -> list[UUID]:
    if not raw:
        return []
    return [UUID(str(x)) for x in list(raw)]


@router.post("/push")
def stack_push(body: FeedStackPushRequest):
    """Append listing id when user leaves a card (pass/like) for undo stack."""
    uid = str(body.user_id)
    lid = UUID(str(body.listing_id))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT listing_ids FROM feed_session_stack WHERE user_id = %s",
                (uid,),
            )
            row = cur.fetchone()
            ids = _as_uuid_list(row["listing_ids"]) if row else []
            if ids and ids[-1] == lid:
                conn.commit()
                return {"ok": True}
            ids.append(lid)
            cur.execute(
                """
                INSERT INTO feed_session_stack (user_id, listing_ids)
                VALUES (%s, %s::uuid[])
                ON CONFLICT (user_id) DO UPDATE SET listing_ids = EXCLUDED.listing_ids
                """,
                (uid, [str(x) for x in ids]),
            )
            conn.commit()
    return {"ok": True}


@router.post("/pop", response_model=FeedStackPopResponse)
def stack_pop(user_id: UUID = Query(...)):
    """Pop last listing from undo stack and return its payload."""
    uid = str(user_id)
    last: UUID | None = None
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT listing_ids FROM feed_session_stack WHERE user_id = %s",
                (uid,),
            )
            row = cur.fetchone()
            if not row:
                return FeedStackPopResponse(listing=None)
            ids = _as_uuid_list(row["listing_ids"])
            if not ids:
                return FeedStackPopResponse(listing=None)
            last = ids[-1]
            new_ids = ids[:-1]
            cur.execute(
                """
                UPDATE feed_session_stack SET listing_ids = %s::uuid[]
                WHERE user_id = %s
                """,
                ([str(x) for x in new_ids], uid),
            )
            conn.commit()

    assert last is not None
    data = fetch_listing_by_id(last)
    if not data:
        raise HTTPException(status_code=404, detail="Listing no longer available")
    return FeedStackPopResponse(listing=FeedListing(**data))
