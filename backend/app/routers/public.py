"""Read-only, login-free standings behind an unguessable share token."""
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.database import get_db, get_setting
from app.limiter import limiter
from app.routers.standings import compute_standings
from app.services.season_service import current_season, current_week, list_weeks, RULES

router = APIRouter(prefix="/api/public", tags=["Public"])


@router.get("/standings/{token}")
@limiter.limit("60/minute")
async def public_standings(request: Request, token: str, session=Depends(get_db)):
    expected = get_setting(session, "share_token")
    if not expected or token != expected:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That link isn't valid anymore")
    season = current_season()
    # Anonymous viewer: unstarted picks stay hidden, like any non-owner
    standings = compute_standings(session, season, viewer_id="", viewer_is_admin=False)
    return {
        "season": season,
        "current_week": current_week(session, season),
        "weeks": list_weeks(session, season),
        "standings": standings,
        "rules": RULES,
    }
