"""Season standings: points (5 cover / 5+spread upset / 1 push), ranked by
points, then outright upsets, then wins."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import secrets

from app.config import settings
from app.database import get_db, get_setting, set_setting
from app.middleware.auth_middleware import get_current_user
from app.schemas.user import UserResponse
from app.services.season_service import current_season, current_week, first_week, list_weeks, points_for, RULES, WIN_RESULTS
from app.services.pick_views import pick_view, can_see_pick
from app.services.stats_service import build_recap

router = APIRouter(prefix="/api/standings", tags=["Standings"])


def compute_standings(session, season: int, viewer_id: Optional[str] = None, viewer_is_admin: bool = False) -> list[dict]:
    users = session.execute(
        "SELECT user_id, COALESCE(display_name, username) AS name, nickname FROM users "
        "WHERE is_active = 1 AND pending_approval = 0").fetchall()
    table = {
        u["user_id"]: {
            "user_id": u["user_id"], "name": u["name"], "nickname": u["nickname"],
            "points": 0.0, "wins": 0, "losses": 0, "pushes": 0, "upsets": 0, "covers": 0, "voids": 0, "pending": 0,
            "picks_made": 0, "picks": [],
        } for u in users
    }

    rows = session.execute(
        "SELECT p.*, COALESCE(u.display_name, u.username) AS user_name FROM picks p "
        "JOIN users u ON u.user_id = p.user_id WHERE p.season = ? AND p.week >= ? ORDER BY p.week",
        (season, first_week())).fetchall()
    games = {g["game_id"]: dict(g) for g in session.execute(
        "SELECT * FROM games WHERE season = ?", (season,)).fetchall()}

    for r in rows:
        p = dict(r)
        entry = table.get(p["user_id"])
        game = games.get(p["game_id"])
        if not entry or not game:
            continue
        entry["picks_made"] += 1
        res = p.get("result")
        pts = points_for(res, p["locked_spread"])
        if pts is not None:
            entry["points"] += pts
        if res in WIN_RESULTS:
            entry["wins"] += 1
            entry["upsets" if res == "upset" else "covers"] += 1
        elif res == "loss":
            entry["losses"] += 1
        elif res == "push":
            entry["pushes"] += 1
        elif res == "void":
            entry["voids"] += 1
        else:
            entry["pending"] += 1
        hidden = viewer_id is not None and not can_see_pick(p, game, viewer_id, viewer_is_admin)
        entry["picks"].append(pick_view(p, game, p["user_name"], hidden=hidden))

    standings = list(table.values())
    # Most points, then most outright upsets, then most wins, then fewest losses, then name
    standings.sort(key=lambda e: (-e["points"], -e["upsets"], -e["wins"], e["losses"], (e["name"] or "").lower()))

    rank, prev_key = 0, None
    for idx, e in enumerate(standings, start=1):
        key = (e["points"], e["upsets"], e["wins"])
        if key != prev_key:
            rank, prev_key = idx, key
        e["rank"] = rank
        e["record"] = f"{e['wins']}-{e['losses']}" + (f"-{e['pushes']}" if e["pushes"] else "")
    counts = {}
    for e in standings:
        counts[e["rank"]] = counts.get(e["rank"], 0) + 1
    for e in standings:
        e["tied"] = counts[e["rank"]] > 1
    return standings


def season_picks(session, season: int) -> list[dict]:
    """Every pick this season as a pick_view (with user_name), settled or not."""
    games = {g["game_id"]: dict(g) for g in session.execute("SELECT * FROM games WHERE season = ?", (season,)).fetchall()}
    rows = session.execute(
        "SELECT p.*, COALESCE(u.display_name, u.username) AS user_name FROM picks p "
        "JOIN users u ON u.user_id = p.user_id WHERE p.season = ? AND p.week >= ? AND u.is_active = 1 ORDER BY p.week",
        (season, first_week())).fetchall()
    out = []
    for r in rows:
        p = dict(r)
        g = games.get(p["game_id"])
        if g:
            out.append(pick_view(p, g, p["user_name"]))
    return out


def share_token(session, rotate: bool = False) -> str:
    token = None if rotate else get_setting(session, "share_token")
    if not token:
        token = secrets.token_urlsafe(9)
        set_setting(session, "share_token", token)
    return token


def share_url(token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/s/{token}"


@router.get("/recap")
async def get_recap(season: Optional[int] = Query(None), current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    """Recap of the latest fully-settled week: dog of the week, biggest upset, hot streaks."""
    season = season or current_season()
    return {"season": season, "recap": build_recap(season_picks(session, season))}


@router.get("/history")
async def get_history(current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    """Every season's podium, newest first. The current season is flagged in progress."""
    this_season = current_season()
    seasons = sorted({r[0] for r in session.execute("SELECT DISTINCT season FROM picks").fetchall()} | {this_season}, reverse=True)
    out = []
    for s in seasons:
        table = compute_standings(session, s, str(current_user.user_id), current_user.is_admin)
        settled_weeks = [r[0] for r in session.execute(
            "SELECT DISTINCT week FROM picks WHERE season = ? AND result IS NOT NULL ORDER BY week", (s,)).fetchall()]
        out.append({
            "season": s,
            "complete": s < this_season,
            "weeks_played": len(settled_weeks),
            "players": len(table),
            "podium": [{k: e[k] for k in ("user_id", "name", "nickname", "rank", "tied", "points", "record", "upsets")} for e in table[:3] if e["picks_made"] > 0],
        })
    return out


@router.get("/share")
async def get_share_link(current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    """A read-only standings link anyone can open — paste it in the group chat."""
    token = share_token(session)
    return {"token": token, "url": share_url(token)}


@router.get("")
async def get_standings(season: Optional[int] = Query(None), current_user: UserResponse = Depends(get_current_user), session=Depends(get_db)):
    this_season = current_season()
    season = season or this_season
    seasons = sorted({r[0] for r in session.execute("SELECT DISTINCT season FROM picks").fetchall()} | {this_season}, reverse=True)
    standings = compute_standings(session, season, str(current_user.user_id), current_user.is_admin)
    settled_weeks = [r[0] for r in session.execute(
        "SELECT DISTINCT week FROM picks WHERE season = ? AND week >= ? AND result IS NOT NULL ORDER BY week",
        (season, first_week())).fetchall()]
    return {
        "season": season,
        "seasons": seasons,
        "current_week": current_week(session, season) if season == this_season else None,
        "weeks": list_weeks(session, season),
        "settled_weeks": settled_weeks,
        "standings": standings,
        "rules": RULES,
    }
