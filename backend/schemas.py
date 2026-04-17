from datetime import date, datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ListingPhoto(BaseModel):
    url: str
    sort_order: int = 0


class FeedListing(BaseModel):
    listing_id: UUID
    host_id: UUID
    host_name: str
    title: str = ""
    photos: list[str]
    price_monthly: int
    start_date: date
    end_date: date
    address: str
    neighborhood: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    room_type: str
    furnished: bool
    rules: str
    utilities: Optional[str] = None
    utilities_included: bool = False
    amenities: dict[str, Any] = Field(default_factory=dict)
    gender_pref: Optional[str] = None
    floor_plan_url: Optional[str] = None
    deposit: Optional[int] = None
    application_fee: Optional[int] = None
    dist_mi: Optional[float] = None


class FeedResponse(BaseModel):
    items: list[FeedListing]
    next_offset: int


class SwipeRequest(BaseModel):
    """MVP: pass user_id until Supabase JWT is wired."""

    user_id: UUID = Field(..., description="Seeker/Host profile id (public.profiles.id)")
    listing_id: UUID
    action: Literal["like", "pass"]
    body: Optional[str] = Field(None, max_length=50, description="Optional note with like (empty allowed)")
    recipient_user_id: Optional[UUID] = Field(
        None,
        description="Host deck: seeker profile id. listing_id must be this host's listing.",
    )


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


# --- Super like -----------------------------------------------------------------
class SuperLikeRequest(BaseModel):
    user_id: UUID
    listing_id: UUID
    body: str = Field(..., min_length=1, max_length=500)


class SuperLikeResponse(BaseModel):
    ok: bool
    message: Optional[str] = None


class SuperLikeListItem(BaseModel):
    super_like_id: UUID
    listing_id: UUID
    title: str
    address: str
    price_monthly: int
    body: str
    counterparty_name: str
    created_at: datetime


class SuperLikeListResponse(BaseModel):
    items: list[SuperLikeListItem]


class SuperLikesRemainingResponse(BaseModel):
    remaining: int
    used: int
    limit: int


# --- Feed stack (back) ----------------------------------------------------------
class FeedStackPushRequest(BaseModel):
    user_id: UUID
    listing_id: UUID


class FeedStackPopResponse(BaseModel):
    listing: Optional[FeedListing] = None


# --- Likes (interests) ----------------------------------------------------------
class LikeListItem(BaseModel):
    interest_id: UUID
    listing_id: UUID
    title: str
    address: str
    price_monthly: int
    photo_url: Optional[str] = None
    counterparty_name: str
    state: str
    note: Optional[str] = None
    created_at: datetime
    conversation_id: Optional[UUID] = None


class LikeListResponse(BaseModel):
    items: list[LikeListItem]


class InterestRespondRequest(BaseModel):
    user_id: UUID = Field(..., description="Responder (interest.recipient_id)")
    action: Literal["accept", "decline"]


class InterestRespondResponse(BaseModel):
    ok: bool
    conversation_id: Optional[UUID] = None
    match_id: Optional[UUID] = None


# --- Chat -----------------------------------------------------------------------
class ChatMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    body: str
    image_url: Optional[str] = None
    created_at: datetime


class ChatMessageCreate(BaseModel):
    user_id: UUID
    body: str = ""
    image_url: Optional[str] = None


class ConversationSummary(BaseModel):
    conversation_id: UUID
    match_id: UUID
    listing_id: Optional[UUID] = None
    other_user_id: UUID
    other_display_name: str
    last_message_at: Optional[datetime] = None


# --- Profile --------------------------------------------------------------------
class ProfileCompletenessResponse(BaseModel):
    percent: int
    missing: list[str]


class SeekerPrefsMe(BaseModel):
    budget_min: int
    budget_max: int
    stay_start_date: date
    stay_end_date: date
    room_type_pref: Optional[str] = None
    furnished_pref: Optional[bool] = None
    gender_pref: Optional[str] = None
    prefs: dict[str, Any] = Field(default_factory=dict)


class ProfileMeResponse(BaseModel):
    id: UUID
    email: str
    role: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    school_email: Optional[str] = None
    school_email_verified_at: Optional[datetime] = None
    grade_or_year: Optional[str] = None
    affiliation: Optional[str] = None
    roommate_prefs: dict[str, Any] = Field(default_factory=dict)
    seeker: Optional[SeekerPrefsMe] = None


class ProfilePatchRequest(BaseModel):
    user_id: UUID
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    school_email: Optional[str] = None
    grade_or_year: Optional[str] = None
    affiliation: Optional[str] = None
    roommate_prefs: Optional[dict[str, Any]] = None


class SeekerPrefsPatchRequest(BaseModel):
    user_id: UUID
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    stay_start_date: Optional[date] = None
    stay_end_date: Optional[date] = None
    room_type_pref: Optional[str] = None
    furnished_pref: Optional[bool] = None
    gender_pref: Optional[str] = None
    prefs: Optional[dict[str, Any]] = None


# --- Listings (host) ------------------------------------------------------------
class ListingCreateRequest(BaseModel):
    user_id: UUID
    title: str = Field(..., min_length=1, max_length=200)
    price_monthly: int = Field(..., ge=0)
    start_date: date
    end_date: date
    address: str = Field(..., min_length=1)
    lat: Optional[float] = None
    lng: Optional[float] = None
    neighborhood: Optional[str] = None
    room_type: str = Field(..., min_length=1)
    furnished: bool = False
    rules: str = Field(default="", max_length=4000)
    utilities: Optional[str] = None
    utilities_included: bool = False
    gender_pref: Optional[str] = None
    floor_plan_url: Optional[str] = None
    deposit: Optional[int] = Field(None, ge=0)
    application_fee: Optional[int] = Field(None, ge=0)
    amenities: dict[str, Any] = Field(default_factory=dict)
    photos: list[ListingPhoto] = Field(..., min_length=3)


class ListingCreateResponse(BaseModel):
    listing_id: UUID
