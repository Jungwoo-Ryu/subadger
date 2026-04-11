from fastapi import APIRouter

from schemas import EmailCheckRequest, EmailCheckResponse
from settings import get_settings

router = APIRouter(prefix="/v1", tags=["auth"])


@router.post("/auth/check-email", response_model=EmailCheckResponse)
def check_email(body: EmailCheckRequest):
    """MVP: @wisc.edu (or ALLOWED_EMAIL_SUFFIX) validation before Supabase sign-up."""
    suffix = get_settings()["allowed_email_suffix"]
    raw = body.email.strip().lower()
    allowed = raw.endswith(suffix)
    return EmailCheckResponse(
        allowed=allowed,
        reason=None if allowed else f"School email ({suffix}) required",
    )
