import json
from uuid import UUID

from fastapi import APIRouter, HTTPException

from db import connection
from schemas import ListingCreateRequest, ListingCreateResponse

router = APIRouter(prefix="/v1/listings", tags=["listings"])


@router.post("", response_model=ListingCreateResponse)
def create_listing(body: ListingCreateRequest):
    """Host creates an active listing with ≥3 photos (meeting spec)."""
    uid = str(body.user_id)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role FROM profiles WHERE id = %s",
                (uid,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row["role"] != "host":
                raise HTTPException(status_code=403, detail="Only host role can create listings")

            cur.execute(
                "SELECT id FROM listings WHERE host_id = %s AND status = 'active'",
                (uid,),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Archive or unpublish existing active listing first (one active per host).",
                )

            cur.execute(
                """
                INSERT INTO listings (
                  host_id, title, price_monthly, start_date, end_date, address,
                  lat, lng, neighborhood, room_type, furnished, rules, utilities,
                  utilities_included, gender_pref, floor_plan_url, deposit, application_fee,
                  amenities, status
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s,
                  %s::jsonb, 'active'
                )
                RETURNING id
                """,
                (
                    uid,
                    body.title.strip(),
                    body.price_monthly,
                    body.start_date,
                    body.end_date,
                    body.address.strip(),
                    body.lat,
                    body.lng,
                    body.neighborhood,
                    body.room_type.strip(),
                    body.furnished,
                    body.rules or "",
                    body.utilities,
                    body.utilities_included,
                    body.gender_pref,
                    body.floor_plan_url,
                    body.deposit,
                    body.application_fee,
                    json.dumps(body.amenities or {}),
                ),
            )
            lid = cur.fetchone()["id"]
            for ph in sorted(body.photos, key=lambda x: x.sort_order):
                cur.execute(
                    """
                    INSERT INTO listing_photos (listing_id, url, sort_order)
                    VALUES (%s, %s, %s)
                    """,
                    (str(lid), ph.url.strip(), ph.sort_order),
                )
            conn.commit()

    return ListingCreateResponse(listing_id=lid)
