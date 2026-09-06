"""The weekly board: every FBS game this week, its line, and who's taken which dog."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.schemas.user import UserResponse
from app.services.season_service import current_season, current_week, list_weeks, RULES
from app.services.pick_views import game_view, pick_view, can_see_pick

router = APIRouter(prefix="/api/board", tags=["Board"])


def _week_picks(session, season: int, week: int) -> list[dict]:
    rows = session.execute(
        "SELECT p.*, COALESCE(u.display_name, u.username) AS user_name "
        "FROM picks p JOIN users u ON u.user_id = p.user_id WHERE p.season = ? AND p.week = ?",
        (season, week)).fetchall()
    return [dict(r) for r in rows]


def build_board(session, user: UserResponse, season: int, week: Optional[int]) -> dict:
    weeks = list_weeks(session, season)
    cw = current_week(session, season)
    week = week or cw
    if weeks and week not in {w["week"] for w in weeks}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Week {week} isn't on the {season} calendar")

    games = [dict(r) for r in session.execute(
        "SELECT * FROM games WHERE season = ? AND week = ? ORDER BY kickoff, name", (season, week)).fetchall()]
    games_by_id = {g["game_id"]: g for g in games}
    picks = _week_picks(session, season, week)
    picks_by_team = {p["team_id"]: p for p in picks}
    me = str(user.user_id)

    my_pick = None
    for p in picks:
        if p["user_id"] == me and p["game_id"] in games_by_id:
            my_pick = pick_view(p, games_by_id[p["game_id"]], p["user_name"])

    out = []
    for g in games:
        v = game_view(g)
        taken = picks_by_team.get(v["underdog_team_id"]) if v["underdog_team_id"] else None
        v["taken"] = taken is not None
        v["is_mine"] = bool(taken and taken["user_id"] == me)
        v["taken_by"] = taken["user_name"] if taken and can_see_pick(taken, g, me, user.is_admin) else None
        out.append(v)

    first_kickoff = min((g["kickoff"] for g in games if g.get("kickoff")), default=None)
    return {
        "season": season,
        "week": week,
        "current_week": cw,
        "weeks": weeks,
        "games": out,
        "my_pick": my_pick,
        "first_kickoff": first_kickoff,
        "picks_in": len(picks),
        "rules": RULES,
    }


@router.get("")
async def get_current_board(
    season: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    session=Depends(get_db),
):
    return build_board(session, current_user, season or current_season(), None)


@router.get("/{week}")
async def get_week_board(
    week: int,
    season: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    session=Depends(get_db),
):
    return build_board(session, current_user, season or current_season(), week)
