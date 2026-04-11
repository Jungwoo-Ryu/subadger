"""Feed query builder: filters, sort, distance (campus), exclusions."""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Optional
from uuid import UUID

from db import connection
from listing_sql import LISTING_DISPLAY_TITLE


def _row_to_item(row: dict) -> dict:
    photos = row.get("photos") or []
    if isinstance(photos, str):
        try:
            photos = json.loads(photos)
        except json.JSONDecodeError:
            photos = []
    if not isinstance(photos, list):
        photos = []
    amenities = row.get("amenities") or {}
    if isinstance(amenities, str):
        try:
            amenities = json.loads(amenities)
        except json.JSONDecodeError:
            amenities = {}
    if not isinstance(amenities, dict):
        amenities = {}
    return {
        "listing_id": row["listing_id"],
        "host_id": row["host_id"],
        "host_name": row["host_name"],
        "title": row.get("title") or "",
        "photos": photos,
        "price_monthly": row["price_monthly"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "address": row["address"],
        "neighborhood": row.get("neighborhood"),
        "lat": row["lat"],
        "lng": row["lng"],
        "room_type": row["room_type"],
        "furnished": row["furnished"],
        "rules": row["rules"],
        "utilities": row["utilities"],
        "utilities_included": bool(row.get("utilities_included", False)),
        "gender_pref": row["gender_pref"],
        "floor_plan_url": row["floor_plan_url"],
        "deposit": row["deposit"],
        "application_fee": row["application_fee"],
        "amenities": amenities,
        "dist_mi": row.get("dist_mi"),
    }


def fetch_feed(
    user_id: UUID,
    limit: int,
    offset: int,
    *,
    move_in_after: Optional[date] = None,
    move_in_before: Optional[date] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    utilities_included: Optional[bool] = None,
    room_types: Optional[list[str]] = None,
    neighborhood: Optional[str] = None,
    max_distance_miles: Optional[float] = None,
    campus_lat: Optional[float] = None,
    campus_lng: Optional[float] = None,
    amenities_keys: Optional[list[str]] = None,
    must_not_rule_keywords: Optional[list[str]] = None,
    sort: str = "newest",
) -> tuple[list[dict], int]:
    sort = (sort or "newest").strip().lower()
    if sort not in ("newest", "price_asc", "price_desc", "distance_asc"):
        sort = "newest"

    use_distance = sort == "distance_asc" or max_distance_miles is not None
    dist_sql = "NULL::double precision AS dist_mi"
    dist_params: list[Any] = []
    if use_distance and campus_lat is not None and campus_lng is not None:
        dist_sql = """
          CASE
            WHEN l.lat IS NULL OR l.lng IS NULL THEN NULL
            ELSE (
              3959 * acos(LEAST(1.0, GREATEST(-1.0,
                cos(radians(%s)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(%s))
                + sin(radians(%s)) * sin(radians(l.lat))
              )))
            )
          END AS dist_mi
        """
        dist_params = [campus_lat, campus_lng, campus_lat]

    where: list[str] = [
        "l.status = 'active'",
        """NOT EXISTS (
          SELECT 1 FROM feed_passes fp
          WHERE fp.swiper_id = %s::uuid AND fp.target_kind = 'listing'
            AND fp.target_id = l.id
        )""",
        """NOT EXISTS (
          SELECT 1 FROM interests i
          WHERE i.sender_id = %s::uuid AND i.listing_id = l.id
            AND i.state IN ('pending', 'accepted')
        )""",
    ]
    params: list[Any] = [str(user_id), str(user_id)]

    if move_in_after is not None:
        where.append("l.end_date >= %s")
        params.append(move_in_after)
    if move_in_before is not None:
        where.append("l.start_date <= %s")
        params.append(move_in_before)
    if min_price is not None:
        where.append("l.price_monthly >= %s")
        params.append(min_price)
    if max_price is not None:
        where.append("l.price_monthly <= %s")
        params.append(max_price)
    if utilities_included is not None:
        where.append("l.utilities_included = %s")
        params.append(utilities_included)
    if room_types:
        cleaned = [f"%{r.strip()}%" for r in room_types if r.strip()]
        if cleaned:
            where.append("l.room_type ILIKE ANY(%s)")
            params.append(cleaned)
    if neighborhood and neighborhood.strip():
        where.append(
            "(l.neighborhood ILIKE %s OR l.address ILIKE %s)"
        )
        q = f"%{neighborhood.strip()}%"
        params.extend([q, q])

    if amenities_keys:
        blob = {k.strip(): True for k in amenities_keys if k.strip()}
        if blob:
            where.append("l.amenities @> %s::jsonb")
            params.append(json.dumps(blob))

    for kw in must_not_rule_keywords or []:
        k = kw.strip()
        if k:
            where.append("NOT (l.rules ILIKE %s)")
            params.append(f"%{k}%")

    if max_distance_miles is not None and campus_lat is not None and campus_lng is not None:
        where.append(
            "l.lat IS NOT NULL AND l.lng IS NOT NULL AND ("
            "3959 * acos(LEAST(1.0, GREATEST(-1.0,"
            " cos(radians(%s)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(%s))"
            " + sin(radians(%s)) * sin(radians(l.lat))"
            "))) <= %s)"
        )
        params.extend([campus_lat, campus_lng, campus_lat, max_distance_miles])

    order_clause = "l.created_at DESC"
    if sort == "price_asc":
        order_clause = "l.price_monthly ASC NULLS LAST, l.created_at DESC"
    elif sort == "price_desc":
        order_clause = "l.price_monthly DESC NULLS LAST, l.created_at DESC"
    elif sort == "distance_asc" and dist_params:
        order_clause = "dist_mi ASC NULLS LAST, l.created_at DESC"

    sql = f"""
      SELECT
        l.id AS listing_id,
        l.host_id,
        p.display_name AS host_name,
        {LISTING_DISPLAY_TITLE} AS title,
        l.price_monthly,
        l.start_date,
        l.end_date,
        l.address,
        l.neighborhood,
        l.lat,
        l.lng,
        l.room_type,
        l.furnished,
        l.rules,
        l.utilities,
        l.utilities_included,
        l.gender_pref,
        l.floor_plan_url,
        l.deposit,
        l.application_fee,
        l.amenities,
        {dist_sql},
        COALESCE(
          json_agg(lp.url ORDER BY lp.sort_order, lp.id)
          FILTER (WHERE lp.id IS NOT NULL),
          '[]'::json
        ) AS photos
      FROM listings l
      JOIN profiles p ON p.id = l.host_id
      LEFT JOIN listing_photos lp ON lp.listing_id = l.id
      WHERE {' AND '.join(where)}
      GROUP BY l.id, p.display_name
      ORDER BY {order_clause}
      LIMIT %s OFFSET %s
    """

    params = dist_params + params + [limit, offset]

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [_row_to_item(r) for r in rows], offset + len(rows)


def fetch_listing_by_id(listing_id: UUID) -> Optional[dict]:
    sql = f"""
      SELECT
        l.id AS listing_id,
        l.host_id,
        p.display_name AS host_name,
        {LISTING_DISPLAY_TITLE} AS title,
        l.price_monthly,
        l.start_date,
        l.end_date,
        l.address,
        l.neighborhood,
        l.lat,
        l.lng,
        l.room_type,
        l.furnished,
        l.rules,
        l.utilities,
        l.utilities_included,
        l.gender_pref,
        l.floor_plan_url,
        l.deposit,
        l.application_fee,
        l.amenities,
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
    """
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (str(listing_id),))
            row = cur.fetchone()
    if not row:
        return None
    r = dict(row)
    r["dist_mi"] = None
    return _row_to_item(r)
