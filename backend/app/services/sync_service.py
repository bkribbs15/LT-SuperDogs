"""
Keep the local `games` table in step with ESPN, and settle picks as games go final.
"""
import logging
from datetime import datetime
from typing import Optional

from app.database import db
from app.services import cfb_data_service as espn
from app.services.season_service import (
    current_season, current_week, first_week, list_weeks, resolve_pick, utcnow,
)

logger = logging.getLogger(__name__)

GAME_COLUMNS = (
    "game_id", "season", "week", "name", "short_name", "kickoff", "status", "status_detail",
    "home_team_id", "home_name", "home_abbr", "home_logo", "home_color", "home_rank", "home_record", "home_conf", "home_score",
    "away_team_id", "away_name", "away_abbr", "away_logo", "away_color", "away_rank", "away_record", "away_conf", "away_score",
    "spread", "favorite_team_id", "spread_source", "venue", "broadcast", "last_updated",
)


def upsert_weeks(session, season: int, weeks: list[dict]) -> int:
    for w in weeks:
        session.execute(
            "INSERT INTO weeks (season, week, label, start_date, end_date) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(season, week) DO UPDATE SET label = excluded.label, "
            "start_date = excluded.start_date, end_date = excluded.end_date",
            (season, w["week"], w["label"], w["start_date"], w["end_date"]),
        )
    session.commit()
    return len(weeks)


def upsert_games(session, games: list[dict]) -> int:
    """Insert new games / refresh existing ones. The spread is frozen once a
    game kicks off or an admin has set it by hand; otherwise ESPN's newest line
    replaces ours (and a missing line never wipes one we already have)."""
    now = utcnow().isoformat()
    count = 0
    for g in games:
        existing = session.execute("SELECT * FROM games WHERE game_id = ?", (g["game_id"],)).fetchone()
        row = dict(g)
        row["last_updated"] = now
        row["spread_source"] = "espn" if g.get("spread") is not None else None

        if existing:
            ex = dict(existing)
            # Frozen once kicked off — whether we already knew that or ESPN is
            # telling us now (a live payload's line isn't a pre-game line).
            frozen = (ex.get("spread_source") == "manual"
                      or ex.get("status") in ("in", "post")
                      or g.get("status") in ("in", "post"))
            if frozen or g.get("spread") is None:
                row["spread"] = ex.get("spread")
                row["favorite_team_id"] = ex.get("favorite_team_id")
                row["spread_source"] = ex.get("spread_source")
            # A final never un-finals (covers admin-entered scores and ESPN hiccups)
            if ex.get("status") == "post" and g.get("status") != "post":
                for c in ("status", "status_detail", "home_score", "away_score"):
                    row[c] = ex.get(c)
            sets = ", ".join(f"{c} = ?" for c in GAME_COLUMNS if c != "game_id")
            session.execute(
                f"UPDATE games SET {sets} WHERE game_id = ?",
                tuple(row.get(c) for c in GAME_COLUMNS if c != "game_id") + (g["game_id"],),
            )
        else:
            placeholders = ", ".join("?" for _ in GAME_COLUMNS)
            session.execute(
                f"INSERT INTO games ({', '.join(GAME_COLUMNS)}) VALUES ({placeholders})",
                tuple(row.get(c) for c in GAME_COLUMNS),
            )
        count += 1
    session.commit()
    return count


def resolve_picks(session, season: int, week: Optional[int] = None, force: bool = False) -> int:
    """Settle every pick whose game is final (or postponed/canceled -> void).
    With force=True, re-settle already-resolved picks too (after an admin
    corrects a score). A voided pick whose game gets rescheduled goes back to
    pending so it settles on the real result."""
    now_iso = utcnow().isoformat()
    revived = session.execute(
        "UPDATE picks SET result = NULL, updated_at = ? WHERE result = 'void' AND season = ? AND game_id IN "
        "(SELECT game_id FROM games WHERE status NOT IN ('post', 'canceled'))",
        (now_iso, season)).rowcount

    query = (
        "SELECT p.pick_id, p.team_id, p.locked_spread, p.result, g.* "
        "FROM picks p JOIN games g ON g.game_id = p.game_id "
        "WHERE p.season = ? AND g.status IN ('post', 'canceled')"
    )
    params: list = [season]
    if week is not None:
        query += " AND p.week = ?"
        params.append(week)
    if not force:
        query += " AND p.result IS NULL"

    updated = revived
    for row in session.execute(query, params).fetchall():
        r = dict(row)
        result = resolve_pick(r, r["team_id"], r["locked_spread"])
        if result and result != r.get("result"):
            session.execute(
                "UPDATE picks SET result = ?, updated_at = ? WHERE pick_id = ?",
                (result, utcnow().isoformat(), r["pick_id"]),
            )
            updated += 1
    session.commit()
    return updated


def live_window(session) -> bool:
    """True while any game on the current board is in play (or past its
    kickoff but not yet reported live) — the scheduler tightens its cadence."""
    season = current_season()
    week = current_week(session, season)
    now_espn = utcnow().strftime("%Y-%m-%dT%H:%MZ")   # ESPN's timestamp shape, so string compare is safe
    row = session.execute(
        "SELECT COUNT(*) FROM games WHERE season = ? AND week = ? AND "
        "(status = 'in' OR (status = 'pre' AND kickoff <= ?))",
        (season, week, now_espn)).fetchone()
    return bool(row and row[0])


async def sync_week(season: int, week: int) -> dict:
    """Fetch one week from ESPN and merge it in. Safe to call repeatedly."""
    data = await espn.fetch_scoreboard(season, week)
    if data is None:
        return {"success": False, "season": season, "week": week, "message": "ESPN request failed"}

    session = db.get_session()
    weeks = upsert_weeks(session, season, espn.parse_calendar(data))
    games = upsert_games(session, espn.parse_events(data, season, week))
    settled = resolve_picks(session, season, week)
    msg = f"week {week}: {games} games, {settled} picks settled"
    logger.info(f"Sync {season} {msg}")
    return {"success": True, "season": season, "week": week, "games": games,
            "weeks": weeks, "picks_settled": settled, "message": msg}


async def sync_current() -> list[dict]:
    """The scheduled job: refresh this week and next (so the upcoming board is
    populated early), plus last week while any of its games are unfinished."""
    session = db.get_session()
    season = current_season()
    week = current_week(session, season)
    known = {w["week"] for w in list_weeks(session, season)}

    targets = [week]
    if not known or (week + 1) in known:
        targets.append(week + 1)
    if week - 1 >= first_week():
        unfinished = session.execute(
            "SELECT COUNT(*) FROM games WHERE season = ? AND week = ? AND status != 'post'",
            (season, week - 1)).fetchone()[0]
        if unfinished:
            targets.insert(0, week - 1)

    results = []
    for w in targets:
        results.append(await sync_week(season, w))
    return results
