from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
import logging

from app.schemas.user import UserResponse
from app.middleware.auth_middleware import get_current_admin_user, user_response
from app.database import get_db, get_setting, set_setting
from app.db_adapters import UserAdapter
from app.services.auth_service import (
    get_password_hash, list_pending_reset_tokens, get_reset_token, mark_token_as_used,
)
from app.config import is_owner_email
from app.services.season_service import current_season, current_week, first_week, list_weeks, has_kicked_off, utcnow
from app.services.sync_service import sync_week, sync_current, resolve_picks
from app.services.pick_views import team_side
from app.tasks.sync_scheduler import get_scheduler_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserResponse])
async def get_all_users(current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    return [user_response(u) for u in UserAdapter.get_all(session)]


@router.get("/users/pending-count")
async def get_pending_user_count(current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Registrations awaiting approval plus open password-reset requests — the navbar badge."""
    pending = session.execute("SELECT COUNT(*) FROM users WHERE pending_approval = 1").fetchone()[0]
    resets = len(list_pending_reset_tokens(session))
    return {"count": pending + resets, "registrations": pending, "reset_requests": resets}


def _target(session, user_id: str) -> dict:
    target = UserAdapter.get_by_id(session, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return target


@router.post("/users/{user_id}/approve")
async def approve_user(user_id: str, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    target = _target(session, user_id)
    if not target.get('pending_approval'):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is not awaiting approval")
    session.execute("UPDATE users SET is_active = 1, pending_approval = 0 WHERE user_id = ?", (str(user_id),))
    session.commit()
    return {"message": f"Approved {target['username']}", "user_id": user_id}


@router.post("/users/{user_id}/deny")
async def deny_user(user_id: str, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Deny a pending registration: the account is deleted so they can re-register later."""
    target = _target(session, user_id)
    if not target.get('pending_approval'):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending registrations can be denied")
    session.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (str(user_id),))
    session.execute("DELETE FROM users WHERE user_id = ?", (str(user_id),))
    session.commit()
    return {"message": f"Denied and removed {target['username']}", "user_id": user_id}


@router.post("/users/{user_id}/toggle-admin")
async def toggle_admin_status(user_id: str, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    if str(current_admin.user_id) == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify your own admin status")
    target = _target(session, user_id)
    if is_owner_email(target['email']):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The owner account cannot be modified")
    new_status = not target['is_admin']
    UserAdapter.set_flag(session, user_id, "is_admin", new_status)
    return {"message": f"User admin status updated to {new_status}", "user_id": user_id, "is_admin": new_status}


@router.post("/users/{user_id}/toggle-active")
async def toggle_active_status(user_id: str, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    if str(current_admin.user_id) == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify your own active status")
    target = _target(session, user_id)
    if is_owner_email(target['email']):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The owner account cannot be modified")
    new_status = not target['is_active']
    UserAdapter.set_flag(session, user_id, "is_active", new_status)
    if new_status and target.get('pending_approval'):
        UserAdapter.set_flag(session, user_id, "pending_approval", False)
    return {"message": f"User active status updated to {new_status}", "user_id": user_id, "is_active": new_status}


class AdminPasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, body: AdminPasswordReset, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Issue a temporary password. The user is forced to change it at next login."""
    target = _target(session, user_id)
    if is_owner_email(target['email']) and not current_admin.is_owner:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only the owner can reset the owner's password")
    UserAdapter.set_password(session, user_id, get_password_hash(body.new_password), must_change=True)
    session.execute("UPDATE password_reset_tokens SET is_used = 1 WHERE user_id = ? AND is_used = 0", (str(user_id),))
    session.commit()
    return {"message": "Temporary password set — they'll be asked to change it at login", "user_id": user_id}


# ── Password reset requests ──────────────────────────────────────────────────

@router.get("/reset-requests")
async def get_reset_requests(current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    return list_pending_reset_tokens(session)


@router.post("/reset-requests/{token}/resolve")
async def resolve_reset_request(token: str, body: AdminPasswordReset, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    req = get_reset_token(session, token)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reset request not found or expired")
    UserAdapter.set_password(session, req['user_id'], get_password_hash(body.new_password), must_change=True)
    mark_token_as_used(session, token)
    return {"message": f"Temporary password set for {req['email']}"}


@router.post("/reset-requests/{token}/dismiss")
async def dismiss_reset_request(token: str, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    mark_token_as_used(session, token)
    return {"message": "Request dismissed"}


# ── Season / sync ────────────────────────────────────────────────────────────

@router.get("/season")
async def get_season(current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    season = current_season()
    override = get_setting(session, "week_override")
    return {
        "season": season,
        "current_week": current_week(session, season),
        "first_week": first_week(),
        "week_override": int(override) if override else None,
        "weeks": list_weeks(session, season),
        "scheduler": get_scheduler_status(),
        "last_sync": (session.execute("SELECT MAX(last_updated) FROM games WHERE season = ?", (season,)).fetchone()[0]),
    }


class SeasonUpdate(BaseModel):
    week_override: Optional[int] = None


@router.put("/season")
async def update_season(body: SeasonUpdate, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Pin the board to a specific week (or clear the pin to follow the calendar)."""
    set_setting(session, "week_override", body.week_override)
    season = current_season()
    return {"message": "Season settings saved", "week_override": body.week_override, "current_week": current_week(session, season)}


@router.post("/sync")
async def trigger_sync(week: Optional[int] = Query(None), current_admin: UserResponse = Depends(get_current_admin_user)):
    """Pull games/lines/scores from ESPN now — one week, or the usual current+next."""
    if week is not None:
        return await sync_week(current_season(), week)
    return await sync_current()


# ── Games: manual overrides ──────────────────────────────────────────────────

class SpreadUpdate(BaseModel):
    spread: float = Field(..., ge=0)
    favorite_team_id: Optional[str] = None


@router.put("/games/{game_id}/spread")
async def set_spread(game_id: str, body: SpreadUpdate, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Hand-set a line (ESPN will stop overwriting it). Picks already on this
    game pick up the new spread if the game hasn't kicked off yet."""
    game = session.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    game = dict(game)
    if body.spread > 0 and team_side(game, body.favorite_team_id or "") is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="favorite_team_id must be one of the two teams")
    favorite = body.favorite_team_id if body.spread > 0 else None
    session.execute(
        "UPDATE games SET spread = ?, favorite_team_id = ?, spread_source = 'manual', last_updated = ? WHERE game_id = ?",
        (body.spread, favorite, utcnow().isoformat(), game_id))
    if not has_kicked_off(game):
        # A changed favorite orphans picks on the old dog — drop them so the board stays honest
        session.execute("DELETE FROM picks WHERE game_id = ? AND team_id = ?", (game_id, favorite or ""))
        session.execute("UPDATE picks SET locked_spread = ?, updated_at = ? WHERE game_id = ?",
                        (body.spread, utcnow().isoformat(), game_id))
    session.commit()
    return {"message": "Spread updated", "game_id": game_id, "spread": body.spread, "favorite_team_id": favorite}


class ResultUpdate(BaseModel):
    home_score: int = Field(..., ge=0)
    away_score: int = Field(..., ge=0)


@router.put("/games/{game_id}/result")
async def set_result(game_id: str, body: ResultUpdate, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Enter (or correct) a final score by hand and re-settle every pick on it."""
    game = session.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    session.execute(
        "UPDATE games SET home_score = ?, away_score = ?, status = 'post', status_detail = 'Final', last_updated = ? WHERE game_id = ?",
        (body.home_score, body.away_score, utcnow().isoformat(), game_id))
    session.commit()
    settled = resolve_picks(session, game["season"], game["week"], force=True)
    return {"message": f"Final saved — {settled} pick(s) re-settled", "game_id": game_id}


@router.post("/picks/resolve")
async def resolve_all(week: Optional[int] = Query(None), current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Re-run settlement for every final game (safety valve)."""
    settled = resolve_picks(session, current_season(), week, force=True)
    return {"message": f"{settled} pick(s) updated"}


@router.delete("/picks/{pick_id}")
async def delete_pick(pick_id: str, current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    row = session.execute("SELECT * FROM picks WHERE pick_id = ?", (pick_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pick not found")
    session.execute("DELETE FROM picks WHERE pick_id = ?", (pick_id,))
    session.commit()
    return {"message": "Pick removed"}


@router.get("/picks")
async def all_picks(week: Optional[int] = Query(None), current_admin: UserResponse = Depends(get_current_admin_user), session=Depends(get_db)):
    """Every pick this season (optionally one week) with the picker's name — for the admin table."""
    season = current_season()
    q = ("SELECT p.*, COALESCE(u.display_name, u.username) AS user_name, u.email, g.short_name, g.status, g.kickoff, "
         "g.home_team_id, g.home_abbr, g.away_abbr, g.home_score, g.away_score "
         "FROM picks p JOIN users u ON u.user_id = p.user_id JOIN games g ON g.game_id = p.game_id WHERE p.season = ?")
    params: list = [season]
    if week is not None:
        q += " AND p.week = ?"
        params.append(week)
    q += " ORDER BY p.week DESC, user_name"
    out = []
    for r in session.execute(q, params).fetchall():
        d = dict(r)
        d["team_abbr"] = d["home_abbr"] if d["team_id"] == d["home_team_id"] else d["away_abbr"]
        out.append(d)
    return out
