"""
Season / week bookkeeping and the SuperDog scoring rule.

Scoring (College GameDay SuperDog rules, per the on-air graphic):
  - A pick is the point-spread underdog of one game, getting at least +4.5.
  - Cover the spread            -> 5 points
  - Win outright ("upset")      -> 5 points + the spread (a +10.5 dog = 15.5)
  - Lose by exactly the spread  -> 1 point (push)
  - Otherwise                   -> 0 (loss)
  - Standings rank by points; outright upsets break ties.
"""
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.database import get_setting

WIN_RESULTS = ("upset", "cover")

MIN_SPREAD = 4.5
COVER_POINTS = 5.0
PUSH_POINTS = 1.0
RULES = {"min_spread": MIN_SPREAD, "cover_points": COVER_POINTS, "push_points": PUSH_POINTS}


def points_for(result: Optional[str], locked_spread: float) -> Optional[float]:
    """Points a settled pick is worth; None while it's still pending."""
    if result is None:
        return None
    if result == "upset":
        return COVER_POINTS + float(locked_spread)
    if result == "cover":
        return COVER_POINTS
    if result == "push":
        return PUSH_POINTS
    return 0.0


def first_week() -> int:
    """The first week that counts. Everything earlier is invisible to the app."""
    return max(1, settings.season_first_week)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value: Optional[str]) -> Optional[datetime]:
    """ESPN timestamps look like 2026-09-11T00:00Z. Always returns aware UTC."""
    if not value:
        return None
    v = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def current_season(now: Optional[datetime] = None) -> int:
    """The college football season is named for the year it starts (Aug–Dec);
    January bowl games still belong to the previous year's season."""
    now = now or utcnow()
    return now.year if now.month >= 6 else now.year - 1


def list_weeks(session, season: int) -> list[dict]:
    rows = session.execute(
        "SELECT season, week, label, start_date, end_date FROM weeks WHERE season = ? AND week >= ? ORDER BY week",
        (season, first_week())).fetchall()
    return [dict(r) for r in rows]


def current_week(session, season: int, now: Optional[datetime] = None) -> int:
    """The week the board should show: an admin override if set, else the
    calendar week containing `now`, else the next upcoming week. Never earlier
    than the season's first week — before it starts, the board sits on that week."""
    return max(_calendar_week(session, season, now), first_week())


def _calendar_week(session, season: int, now: Optional[datetime] = None) -> int:
    override = get_setting(session, "week_override")
    if override:
        try:
            return int(override)
        except ValueError:
            pass

    now = now or utcnow()
    weeks = list_weeks(session, season)
    for w in weeks:
        start, end = parse_ts(w["start_date"]), parse_ts(w["end_date"])
        if start and end and start <= now < end:
            return w["week"]
    for w in weeks:
        start = parse_ts(w["start_date"])
        if start and now < start:
            return w["week"]
    return weeks[-1]["week"] if weeks else first_week()


def underdog_team_id(game: dict) -> Optional[str]:
    """The team getting points, or None if no line / pick'em."""
    fav = game.get("favorite_team_id")
    if not fav or not game.get("spread"):
        return None
    if fav == game.get("home_team_id"):
        return game.get("away_team_id")
    if fav == game.get("away_team_id"):
        return game.get("home_team_id")
    return None


def is_eligible(game: dict) -> bool:
    """A dog exists and it's getting at least the minimum spread."""
    return underdog_team_id(game) is not None and float(game.get("spread") or 0) >= MIN_SPREAD


def has_kicked_off(game: dict, now: Optional[datetime] = None) -> bool:
    """Picks lock at kickoff — by the clock, or as soon as ESPN says it's live."""
    if game.get("status") in ("in", "post"):
        return True
    kickoff = parse_ts(game.get("kickoff"))
    return bool(kickoff and (now or utcnow()) >= kickoff)


def resolve_result(dog_score: Optional[int], fav_score: Optional[int], spread: float) -> Optional[str]:
    """upset | cover | push | loss, or None if scores are missing."""
    if dog_score is None or fav_score is None:
        return None
    if dog_score > fav_score:
        return "upset"
    margin = fav_score - dog_score
    if margin < spread:
        return "cover"
    if margin == spread:
        return "push"
    return "loss"


def resolve_pick(game: dict, team_id: str, locked_spread: float) -> Optional[str]:
    """Resolve one pick against a FINAL game. None if the game isn't final."""
    if game.get("status") != "post":
        return None
    home, away = game.get("home_score"), game.get("away_score")
    if team_id == game.get("home_team_id"):
        return resolve_result(home, away, locked_spread)
    if team_id == game.get("away_team_id"):
        return resolve_result(away, home, locked_spread)
    return None
