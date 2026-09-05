"""Make, change, or drop your one SuperDog pick for the week."""
import sqlite3
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4
import logging

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.schemas.user import UserResponse
from app.services.season_service import (
    current_season, current_week, underdog_team_id, has_kicked_off, utcnow,
)
from app.services.pick_views import pick_view, can_see_pick, team_side

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/picks", tags=["Picks"])


class PickCreate(BaseModel):
    game_id: str
    team_id: str


def _team_name(game: dict, team_id: str) -> str:
    side = team_side(game, team_id)
    return game.get(f"{side}_name") or team_id if side else team_id


def _my_pick_row(session, user_id: str, season: int, week: int) -> Optional[dict]:
    row = session.execute(
        "SELECT * FROM picks WHERE user_id = ? AND season = ? AND week = ?",
        (user_id, season, week)).fetchone()
    return dict(row) if row else None


def _game(session, game_id: str) -> Optional[dict]:
    row = session.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
    return dict(row) if row else None


def _assert_my_pick_unlocked(session, existing: Optional[dict]):
    if not existing:
        return
    game = _game(session, existing["game_id"])
    if game and has_kicked_off(game):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your pick is locked — {_team_name(game, existing['team_id'])} has already kicked off",
        )


@router.post("")
async def make_pick(body: PickCreate, current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    """Lock in (or switch) this week's SuperDog. Rules enforced here:
    underdog only, before kickoff, and one owner per dog per week."""
    season = current_season()
    week = current_week(session, season)
    me = str(current_user.user_id)

    game = _game(session, body.game_id)
    if not game or game["season"] != season or game["week"] != week:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That game isn't on this week's board")

    dog = underdog_team_id(game)
    if not dog:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No line is posted for that game yet")
    if body.team_id != dog:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"SuperDogs only — {_team_name(game, dog)} is the underdog in that game")
    if has_kicked_off(game):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That game has already kicked off")

    existing = _my_pick_row(session, me, season, week)
    _assert_my_pick_unlocked(session, existing)

    taken = session.execute(
        "SELECT user_id FROM picks WHERE season = ? AND week = ? AND team_id = ? AND user_id != ?",
        (season, week, dog, me)).fetchone()
    if taken:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"{_team_name(game, dog)} is already taken this week — first to lock it in gets it")

    now = utcnow().isoformat()
    try:
        if existing:
            session.execute(
                "UPDATE picks SET game_id = ?, team_id = ?, locked_spread = ?, result = NULL, updated_at = ? WHERE pick_id = ?",
                (game["game_id"], dog, game["spread"], now, existing["pick_id"]))
            pick_id = existing["pick_id"]
        else:
            pick_id = str(uuid4())
            session.execute(
                "INSERT INTO picks (pick_id, user_id, season, week, game_id, team_id, locked_spread, result, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                (pick_id, me, season, week, game["game_id"], dog, game["spread"], now, now))
        session.commit()
    except sqlite3.IntegrityError:
        session.rollback()
        # Two people raced for the same dog — the UNIQUE(season, week, team_id) index decides
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"{_team_name(game, dog)} was just taken by someone else")

    logger.info(f"{current_user.email} picked {_team_name(game, dog)} (+{game['spread']}) week {week}")
    pick = dict(session.execute("SELECT * FROM picks WHERE pick_id = ?", (pick_id,)).fetchone())
    return pick_view(pick, game, current_user.display_name or current_user.username)


@router.delete("/current")
async def drop_pick(current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    season = current_season()
    week = current_week(session, season)
    existing = _my_pick_row(session, str(current_user.user_id), season, week)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="You haven't made a pick this week")
    _assert_my_pick_unlocked(session, existing)
    session.execute("DELETE FROM picks WHERE pick_id = ?", (existing["pick_id"],))
    session.commit()
    return {"message": "Pick removed"}


@router.get("/mine")
async def my_picks(season: Optional[int] = Query(None), current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    season = season or current_season()
    rows = session.execute(
        "SELECT * FROM picks WHERE user_id = ? AND season = ? ORDER BY week",
        (str(current_user.user_id), season)).fetchall()
    name = current_user.display_name or current_user.username
    out = []
    for r in rows:
        game = _game(session, r["game_id"])
        if game:
            out.append(pick_view(dict(r), game, name))
    return out


@router.get("/week/{week}")
async def week_picks(week: int, season: Optional[int] = Query(None), current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    """Everyone's pick for a week. Teams stay hidden until their game kicks off
    (the GameDay "submit blind to the producer" rule) — except your own."""
    season = season or current_season()
    rows = session.execute(
        "SELECT p.*, COALESCE(u.display_name, u.username) AS user_name "
        "FROM picks p JOIN users u ON u.user_id = p.user_id WHERE p.season = ? AND p.week = ?",
        (season, week)).fetchall()
    me = str(current_user.user_id)
    out = []
    for r in rows:
        p = dict(r)
        game = _game(session, p["game_id"])
        if not game:
            continue
        hidden = not can_see_pick(p, game, me, current_user.is_admin)
        out.append(pick_view(p, game, p["user_name"], hidden=hidden))
    out.sort(key=lambda v: (v["user_name"] or "").lower())
    return out
