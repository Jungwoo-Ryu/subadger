from datetime import date
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ListingPhoto(BaseModel):
    url: str
    sort_order: int = 0


class FeedListing(BaseModel):
    listing_id: UUID
    host_id: UUID
    host_name: str
    photos: list[str]
    price_monthly: int
    start_date: date
    end_date: date
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    room_type: str
    furnished: bool
    rules: str
    utilities: Optional[str] = None
    gender_pref: Optional[str] = None
    floor_plan_url: Optional[str] = None
    deposit: Optional[int] = None
    application_fee: Optional[int] = None


class FeedResponse(BaseModel):
    items: list[FeedListing]
    next_offset: int


class SwipeRequest(BaseModel):
    """MVP: pass user_id until Supabase JWT is wired."""

    user_id: UUID = Field(..., description="Seeker/Host profile id (public.profiles.id)")
    listing_id: UUID
    action: Literal["like", "pass"]
    body: Optional[str] = Field(None, max_length=50, description="Optional note with like")


class SwipeResponse(BaseModel):
    ok: bool


class EmailCheckRequest(BaseModel):
    email: EmailStr


class EmailCheckResponse(BaseModel):
    allowed: bool
    reason: Optional[str] = None


class LoginRequest(BaseModel):
    """Email can be `system` or `system@wisc.edu` — normalized server-side."""

    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    user_id: UUID
    access_token: str
