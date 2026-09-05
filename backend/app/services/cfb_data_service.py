"""
Pull FBS games, kickoff times, point spreads and scores from ESPN's public
college football scoreboard. No API key required.

  scoreboard?groups=80&week=N&seasontype=2&dates=YYYY&limit=400

Notes on the payload that shape this code:
  - `leagues[0].calendar` carries the season's week list (start/end dates).
  - `competitions[0].odds[0]` has `spread` (magnitude) plus `homeTeamOdds` /
    `awayTeamOdds` with a `favorite` flag. Odds are only present while a game
    is upcoming — they vanish once it's final, so we persist them ourselves.
  - `status.type.state` is one of pre / in / post.
"""
import logging
import re
from typing import Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def fetch_scoreboard(season: int, week: int) -> Optional[dict]:
    """Fetch one regular-season week's scoreboard. Returns None on failure."""
    params = {
        "groups": settings.cfb_group,
        "limit": 400,
        "week": week,
        "seasontype": 2,
        "dates": season,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(settings.cfb_api_url, params=params)
            r.raise_for_status()
            return r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"ESPN scoreboard fetch failed (season={season}, week={week}): {e}")
        return None


def parse_calendar(data: dict) -> list[dict]:
    """Regular-season weeks: [{week, label, start_date, end_date}]."""
    weeks = []
    leagues = (data or {}).get("leagues") or []
    if not leagues:
        return weeks
    for block in leagues[0].get("calendar") or []:
        # Only the regular season counts for the SuperDog standings
        if str(block.get("value")) != "2" and (block.get("label") or "").lower() != "regular season":
            continue
        for entry in block.get("entries") or []:
            try:
                week = int(entry.get("value"))
            except (TypeError, ValueError):
                continue
            weeks.append({
                "week": week,
                "label": entry.get("label") or f"Week {week}",
                "start_date": entry.get("startDate"),
                "end_date": entry.get("endDate"),
            })
    return weeks


def _rank(competitor: dict) -> Optional[int]:
    rank = ((competitor.get("curatedRank") or {}).get("current"))
    try:
        rank = int(rank)
    except (TypeError, ValueError):
        return None
    return rank if 1 <= rank <= 25 else None


def _score(competitor: dict, state: str) -> Optional[int]:
    if state == "pre":
        return None
    try:
        return int(competitor.get("score"))
    except (TypeError, ValueError):
        return None


def _parse_odds(odds_list: list, home: dict, away: dict) -> tuple[Optional[float], Optional[str]]:
    """Return (spread, favorite_team_id). spread is a positive magnitude.
    (None, None) when no line is posted; (0, None) for a pick'em."""
    if not odds_list:
        return None, None
    o = odds_list[0] or {}
    spread = o.get("spread")
    try:
        spread = abs(float(spread)) if spread is not None else None
    except (TypeError, ValueError):
        spread = None

    home_id = str(home["team"]["id"])
    away_id = str(away["team"]["id"])
    favorite = None
    if (o.get("homeTeamOdds") or {}).get("favorite"):
        favorite = home_id
    elif (o.get("awayTeamOdds") or {}).get("favorite"):
        favorite = away_id
    else:
        # Fall back to the "MIZ -6.5" details string
        m = re.match(r"^\s*([A-Z&]+)\s+(-?\d+(\.\d+)?)", o.get("details") or "")
        if m:
            abbr = m.group(1)
            if abbr == home["team"].get("abbreviation"):
                favorite = home_id
            elif abbr == away["team"].get("abbreviation"):
                favorite = away_id
            if spread is None:
                spread = abs(float(m.group(2)))

    if spread is None:
        return None, None
    if spread == 0:
        return 0.0, None
    return spread, favorite


def parse_events(data: dict, season: int, requested_week: int) -> list[dict]:
    """Flatten ESPN events into rows matching the `games` table."""
    games = []
    for event in (data or {}).get("events") or []:
        try:
            comp = event["competitions"][0]
            competitors = comp["competitors"]
            home = next(c for c in competitors if c.get("homeAway") == "home")
            away = next(c for c in competitors if c.get("homeAway") == "away")
        except (KeyError, IndexError, StopIteration):
            continue

        status_type = ((event.get("status") or {}).get("type") or {})
        state = status_type.get("state") or "pre"
        if state not in ("pre", "in", "post"):
            state = "pre"

        week = ((event.get("week") or {}).get("number")) or requested_week
        spread, favorite = _parse_odds(comp.get("odds") or [], home, away)

        broadcasts = []
        for b in comp.get("broadcasts") or []:
            broadcasts.extend(b.get("names") or [])

        games.append({
            "game_id": str(event["id"]),
            "season": season,
            "week": int(week),
            "name": event.get("name"),
            "short_name": event.get("shortName"),
            "kickoff": event.get("date"),
            "status": state,
            "status_detail": status_type.get("shortDetail") or status_type.get("detail"),
            "home_team_id": str(home["team"]["id"]),
            "home_name": home["team"].get("displayName"),
            "home_abbr": home["team"].get("abbreviation"),
            "home_logo": home["team"].get("logo"),
            "home_color": home["team"].get("color"),
            "home_rank": _rank(home),
            "home_score": _score(home, state),
            "away_team_id": str(away["team"]["id"]),
            "away_name": away["team"].get("displayName"),
            "away_abbr": away["team"].get("abbreviation"),
            "away_logo": away["team"].get("logo"),
            "away_color": away["team"].get("color"),
            "away_rank": _rank(away),
            "away_score": _score(away, state),
            "spread": spread,
            "favorite_team_id": favorite,
            "venue": (comp.get("venue") or {}).get("fullName"),
            "broadcast": ", ".join(broadcasts) if broadcasts else None,
        })
    return games
