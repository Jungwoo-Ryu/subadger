"""Feed listing deck + filters."""

from __future__ import annotations

import os
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from features.feed.service import fetch_feed, fetch_listing_by_id
from schemas import FeedListing, FeedResponse

router = APIRouter(prefix="/v1", tags=["feed"])


def _campus_coords() -> tuple[Optional[float], Optional[float]]:
    try:
        lat = os.getenv("CAMPUS_LAT")
        lng = os.getenv("CAMPUS_LNG")
        if lat and lng:
            return float(lat), float(lng)
    except (TypeError, ValueError):
        pass
    return None, None


@router.get("/feed", response_model=FeedResponse)
def get_feed(
    user_id: UUID = Query(..., description="Current user's profile id"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    move_in_after: Optional[date] = None,
    move_in_before: Optional[date] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    utilities_included: Optional[bool] = None,
    room_types: Optional[str] = Query(
        None, description="Comma-separated, e.g. Studio,1BR,Shared"
    ),
    neighborhood: Optional[str] = None,
    max_distance_miles: Optional[float] = Query(None, ge=0, le=500),
    amenities: Optional[str] = Query(None, description="Comma-separated keys, e.g. gym,parking"),
    must_not_rules: Optional[str] = Query(
        None, description="Comma-separated keywords excluded from house rules text"
    ),
    sort: str = Query("newest", description="newest | price_asc | price_desc | distance_asc"),
):
    campus_lat, campus_lng = _campus_coords()
    rt_list = [x.strip() for x in room_types.split(",")] if room_types else None
    am_list = [x.strip() for x in amenities.split(",")] if amenities else None
    mn_list = [x.strip() for x in must_not_rules.split(",")] if must_not_rules else None

    rows, next_off = fetch_feed(
        user_id,
        limit,
        offset,
        move_in_after=move_in_after,
        move_in_before=move_in_before,
        min_price=min_price,
        max_price=max_price,
        utilities_included=utilities_included,
        room_types=rt_list,
        neighborhood=neighborhood,
        max_distance_miles=max_distance_miles,
        campus_lat=campus_lat,
        campus_lng=campus_lng,
        amenities_keys=am_list,
        must_not_rule_keywords=mn_list,
        sort=sort,
    )
    items = [FeedListing(**r) for r in rows]
    return FeedResponse(items=items, next_offset=next_off)


@router.get("/listings/{listing_id}", response_model=FeedListing)
def get_listing(listing_id: UUID):
    row = fetch_listing_by_id(listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    return FeedListing(**row)
