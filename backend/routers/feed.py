import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from db import connection
from schemas import FeedListing, FeedResponse

router = APIRouter(prefix="/v1", tags=["feed"])


@router.get("/feed", response_model=FeedResponse)
def get_feed(
    user_id: UUID = Query(..., description="Current user's profile id"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """
    Active listings for Seeker swipe deck.
    Excludes listings the user already passed (feed_passes) or already liked (pending/accepted interests as sender).
    """
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  l.id AS listing_id,
                  l.host_id,
                  p.display_name AS host_name,
                  l.price_monthly,
                  l.start_date,
                  l.end_date,
                  l.address,
                  l.lat,
                  l.lng,
                  l.room_type,
                  l.furnished,
                  l.rules,
                  l.utilities,
                  l.gender_pref,
                  l.floor_plan_url,
                  l.deposit,
                  l.application_fee,
                  COALESCE(
                    json_agg(lp.url ORDER BY lp.sort_order, lp.id)
                    FILTER (WHERE lp.id IS NOT NULL),
                    '[]'::json
                  ) AS photos
                FROM listings l
                JOIN profiles p ON p.id = l.host_id
                LEFT JOIN listing_photos lp ON lp.listing_id = l.id
                WHERE l.status = 'active'
                  AND NOT EXISTS (
                    SELECT 1 FROM feed_passes fp
                    WHERE fp.swiper_id = %s::uuid AND fp.target_kind = 'listing'
                      AND fp.target_id = l.id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM interests i
                    WHERE i.sender_id = %s::uuid AND i.listing_id = l.id
                      AND i.state IN ('pending', 'accepted')
                  )
                GROUP BY l.id, p.display_name
                ORDER BY l.created_at DESC
                LIMIT %s OFFSET %s
                """,
                (str(user_id), str(user_id), limit, offset),
            )
            rows = cur.fetchall()

    items: list[FeedListing] = []
    for row in rows:
        photos = row.get("photos") or []
        if isinstance(photos, str):
            try:
                photos = json.loads(photos)
            except json.JSONDecodeError:
                photos = []
        if not isinstance(photos, list):
            photos = []
        items.append(
            FeedListing(
                listing_id=row["listing_id"],
                host_id=row["host_id"],
                host_name=row["host_name"],
                photos=photos,
                price_monthly=row["price_monthly"],
                start_date=row["start_date"],
                end_date=row["end_date"],
                address=row["address"],
                lat=row["lat"],
                lng=row["lng"],
                room_type=row["room_type"],
                furnished=row["furnished"],
                rules=row["rules"],
                utilities=row["utilities"],
                gender_pref=row["gender_pref"],
                floor_plan_url=row["floor_plan_url"],
                deposit=row["deposit"],
                application_fee=row["application_fee"],
            )
        )

    return FeedResponse(items=items, next_offset=offset + len(items))


@router.get("/listings/{listing_id}", response_model=FeedListing)
def get_listing(listing_id: UUID):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  l.id AS listing_id,
                  l.host_id,
                  p.display_name AS host_name,
                  l.price_monthly,
                  l.start_date,
                  l.end_date,
                  l.address,
                  l.lat,
                  l.lng,
                  l.room_type,
                  l.furnished,
                  l.rules,
                  l.utilities,
                  l.gender_pref,
                  l.floor_plan_url,
                  l.deposit,
                  l.application_fee,
                  COALESCE(
                    json_agg(lp.url ORDER BY lp.sort_order, lp.id)
                    FILTER (WHERE lp.id IS NOT NULL),
                    '[]'::json
                  ) AS photos
                FROM listings l
                JOIN profiles p ON p.id = l.host_id
                LEFT JOIN listing_photos lp ON lp.listing_id = l.id
                WHERE l.id = %s AND l.status = 'active'
                GROUP BY l.id, p.display_name
                """,
                (str(listing_id),),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    photos = row.get("photos") or []
    if isinstance(photos, str):
        try:
            photos = json.loads(photos)
        except json.JSONDecodeError:
            photos = []
    if not isinstance(photos, list):
        photos = []
    return FeedListing(
        listing_id=row["listing_id"],
        host_id=row["host_id"],
        host_name=row["host_name"],
        photos=photos,
        price_monthly=row["price_monthly"],
        start_date=row["start_date"],
        end_date=row["end_date"],
        address=row["address"],
        lat=row["lat"],
        lng=row["lng"],
        room_type=row["room_type"],
        furnished=row["furnished"],
        rules=row["rules"],
        utilities=row["utilities"],
        gender_pref=row["gender_pref"],
        floor_plan_url=row["floor_plan_url"],
        deposit=row["deposit"],
        application_fee=row["application_fee"],
    )
