import threading
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from psycopg import sql as psql
from psycopg.types.json import Json

from db import connection
from schemas import (
    ProfileCompletenessResponse,
    ProfileMeResponse,
    ProfilePatchRequest,
    SeekerPrefsMe,
    SeekerPrefsPatchRequest,
)

router = APIRouter(prefix="/v1/profiles", tags=["profiles"])

_WEIGHT_TOTAL = 10

_col_lock = threading.Lock()
_PROFILE_COLS_CACHE: list[str] | None = None
_SEEKER_COLS_CACHE: list[str] | None = None


def _columns_for_table(cur, table: str) -> list[str]:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    )
    return [r[0] for r in cur.fetchall()]


def _profiles_columns(cur) -> list[str]:
    """Cached: only columns that actually exist (works on DBs before profile extension migration)."""
    global _PROFILE_COLS_CACHE
    if _PROFILE_COLS_CACHE is not None:
        return _PROFILE_COLS_CACHE
    with _col_lock:
        if _PROFILE_COLS_CACHE is None:
            _PROFILE_COLS_CACHE = _columns_for_table(cur, "profiles")
        return _PROFILE_COLS_CACHE


def _seeker_columns(cur) -> list[str]:
    global _SEEKER_COLS_CACHE
    if _SEEKER_COLS_CACHE is not None:
        return _SEEKER_COLS_CACHE
    with _col_lock:
        if _SEEKER_COLS_CACHE is None:
            _SEEKER_COLS_CACHE = _columns_for_table(cur, "seeker_profiles")
        return _SEEKER_COLS_CACHE


def _select_profile_row(cur, user_id: str):
    cols = _profiles_columns(cur)
    if not cols:
        return None
    q = psql.SQL("SELECT {} FROM profiles WHERE id = %s").format(
        psql.SQL(", ").join(psql.Identifier(c) for c in cols)
    )
    cur.execute(q, (str(user_id),))
    return cur.fetchone()


def _select_seeker_row(cur, user_id: str):
    cols = _seeker_columns(cur)
    if not cols:
        return None
    q = psql.SQL("SELECT {} FROM seeker_profiles WHERE user_id = %s").format(
        psql.SQL(", ").join(psql.Identifier(c) for c in cols)
    )
    cur.execute(q, (str(user_id),))
    return cur.fetchone()


def _ensure_seeker_row(cur, user_id: str) -> None:
    cur.execute(
        """
        INSERT INTO seeker_profiles (user_id, budget_min, budget_max, stay_start_date, stay_end_date)
        VALUES (%s::uuid, 0, 3000, CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days')
        ON CONFLICT (user_id) DO NOTHING
        """,
        (user_id,),
    )


def _seeker_prefs_from_row(sp: dict) -> SeekerPrefsMe | None:
    """Avoid 500 if seeker_profiles row is partial or corrupted."""
    try:
        bmin, bmax = sp.get("budget_min"), sp.get("budget_max")
        sd, ed = sp.get("stay_start_date"), sp.get("stay_end_date")
        if bmin is None or bmax is None or sd is None or ed is None:
            return None
        pr = sp.get("prefs")
        if not isinstance(pr, dict):
            pr = {}
        return SeekerPrefsMe(
            budget_min=int(bmin),
            budget_max=int(bmax),
            stay_start_date=sd,
            stay_end_date=ed,
            room_type_pref=sp.get("room_type_pref"),
            furnished_pref=sp.get("furnished_pref"),
            gender_pref=sp.get("gender_pref"),
            prefs=pr,
        )
    except (TypeError, ValueError):
        return None


def _completeness_for_row(p: dict, sp: dict | None) -> tuple[int, list[str]]:
    missing: list[str] = []
    score = 0

    if (p.get("display_name") or "").strip():
        score += 1
    else:
        missing.append("display_name")

    if (p.get("avatar_url") or "").strip():
        score += 1
    else:
        missing.append("avatar_url")

    if (p.get("email") or "").strip():
        score += 1
    else:
        missing.append("email")

    if p.get("school_email_verified_at"):
        score += 2
    else:
        missing.append("school_email_verified")

    if (p.get("grade_or_year") or "").strip() or (p.get("affiliation") or "").strip():
        score += 1
    else:
        missing.append("grade_or_affiliation")

    role = (p.get("role") or "").strip()
    if role == "seeker":
        if sp:
            if sp.get("budget_max") is not None and sp.get("budget_min") is not None:
                score += 1
            else:
                missing.append("seeker_budget")
            if sp.get("stay_start_date") and sp.get("stay_end_date"):
                score += 1
            else:
                missing.append("seeker_stay_window")
            prefs = sp.get("prefs") if isinstance(sp.get("prefs"), dict) else {}
            if prefs.get("preferred_neighborhoods") or prefs.get("neighborhoods"):
                score += 1
            else:
                missing.append("preferred_area")
        else:
            missing.append("seeker_profile")
    elif role == "host":
        score += 3
    else:
        missing.append("role_or_seeker_prefs")

    rm = p.get("roommate_prefs")
    if isinstance(rm, dict) and len(rm) > 0:
        score += 1
    else:
        missing.append("roommate_prefs")

    pct = int(round(100 * score / _WEIGHT_TOTAL))
    pct = min(100, max(0, pct))
    return pct, missing


@router.get("/completeness", response_model=ProfileCompletenessResponse)
def profile_completeness(user_id: UUID = Query(...)):
    with connection() as conn:
        with conn.cursor() as cur:
            p = _select_profile_row(cur, str(user_id))
            if not p:
                raise HTTPException(status_code=404, detail="Profile not found")
            sp = None
            if p["role"] == "seeker":
                sp = _select_seeker_row(cur, str(user_id))
    pct, missing = _completeness_for_row(dict(p), dict(sp) if sp else None)
    return ProfileCompletenessResponse(percent=pct, missing=missing)


@router.get("/me", response_model=ProfileMeResponse)
def get_profile_me(user_id: UUID = Query(...)):
    with connection() as conn:
        with conn.cursor() as cur:
            p = _select_profile_row(cur, str(user_id))
            if not p:
                raise HTTPException(status_code=404, detail="Profile not found")
            row = dict(p)
            rp = row.get("roommate_prefs")
            if not isinstance(rp, dict):
                rp = {}

            seeker_block: SeekerPrefsMe | None = None
            if (row.get("role") or "").strip() == "seeker":
                _ensure_seeker_row(cur, str(user_id))
                sp = _select_seeker_row(cur, str(user_id))
                if sp:
                    seeker_block = _seeker_prefs_from_row(dict(sp))
            conn.commit()

    return ProfileMeResponse(
        id=row["id"],
        email=row["email"] or "",
        role=(row.get("role") or "").strip(),
        display_name=row.get("display_name"),
        avatar_url=row.get("avatar_url"),
        school_email=row.get("school_email"),
        school_email_verified_at=row.get("school_email_verified_at"),
        grade_or_year=row.get("grade_or_year"),
        affiliation=row.get("affiliation"),
        roommate_prefs=rp,
        seeker=seeker_block,
    )


@router.patch("/me")
def patch_profile(body: ProfilePatchRequest):
    with connection() as conn:
        with conn.cursor() as cur:
            allowed = frozenset(_profiles_columns(cur))
            parts: list[psql.SQL] = []
            vals: list = []
            mapping = [
                ("display_name", body.display_name),
                ("avatar_url", body.avatar_url),
                ("school_email", body.school_email),
                ("grade_or_year", body.grade_or_year),
                ("affiliation", body.affiliation),
            ]
            for col, v in mapping:
                if v is not None and col in allowed:
                    parts.append(psql.SQL("{} = %s").format(psql.Identifier(col)))
                    vals.append(v)
            if body.roommate_prefs is not None and "roommate_prefs" in allowed:
                parts.append(psql.SQL("{} = %s::jsonb").format(psql.Identifier("roommate_prefs")))
                vals.append(Json(body.roommate_prefs))
            if not parts:
                return {"ok": True, "updated": False}
            vals.append(str(body.user_id))
            upd = psql.SQL("UPDATE profiles SET {} WHERE id = %s").format(psql.SQL(", ").join(parts))
            cur.execute(upd, vals)
            conn.commit()
    return {"ok": True, "updated": True}


@router.patch("/me/seeker")
def patch_seeker_prefs(body: SeekerPrefsPatchRequest):
    uid = str(body.user_id)
    with connection() as conn:
        with conn.cursor() as cur:
            allowed = frozenset(_seeker_columns(cur))
            parts: list[psql.SQL] = []
            vals: list = []
            mapping = [
                ("budget_min", body.budget_min),
                ("budget_max", body.budget_max),
                ("stay_start_date", body.stay_start_date),
                ("stay_end_date", body.stay_end_date),
                ("room_type_pref", body.room_type_pref),
                ("furnished_pref", body.furnished_pref),
                ("gender_pref", body.gender_pref),
            ]
            for col, v in mapping:
                if v is not None and col in allowed:
                    parts.append(psql.SQL("{} = %s").format(psql.Identifier(col)))
                    vals.append(v)
            if body.prefs is not None and "prefs" in allowed:
                parts.append(psql.SQL("{} = %s::jsonb").format(psql.Identifier("prefs")))
                vals.append(Json(body.prefs))
            if not parts:
                return {"ok": True, "updated": False}
            _ensure_seeker_row(cur, uid)
            vals.append(uid)
            upd = psql.SQL("UPDATE seeker_profiles SET {} WHERE user_id = %s").format(
                psql.SQL(", ").join(parts)
            )
            cur.execute(upd, vals)
            conn.commit()
    return {"ok": True, "updated": True}
