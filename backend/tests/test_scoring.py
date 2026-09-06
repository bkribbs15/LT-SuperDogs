"""
Safety net for the SuperDog rules. Zero external dependencies — Python's
built-in unittest against a throwaway SQLite file. Nothing here touches ESPN
or your real local_dev.db.

Run from backend/:   python -m unittest discover -s tests -t . -v
"""
import os
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-not-used-anywhere-real")

from fastapi import HTTPException  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import db, set_setting  # noqa: E402
from app.services import cfb_data_service as espn  # noqa: E402
from app.services.season_service import (  # noqa: E402
    resolve_result, resolve_pick, underdog_team_id, has_kicked_off, current_week, current_season,
    points_for, is_eligible,
)
from app.services.pick_views import game_view  # noqa: E402
from app.services.sync_service import upsert_games, upsert_weeks, resolve_picks  # noqa: E402
from app.routers import picks as picks_router  # noqa: E402
from app.routers.standings import compute_standings  # noqa: E402
from app.schemas.user import UserResponse  # noqa: E402

SEASON = current_season()
NOW = datetime.now(timezone.utc)
FUTURE = (NOW + timedelta(days=2)).strftime("%Y-%m-%dT%H:%MZ")
PAST = (NOW - timedelta(days=2)).strftime("%Y-%m-%dT%H:%MZ")


def _fresh_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    db._sqlite_path = path
    db._local = threading.local()
    conn = db.sqlite_conn
    db.session = conn
    db._create_tables()
    return conn, path


def game_row(game_id, week=1, kickoff=FUTURE, status="pre", spread=6.5, favorite="home",
             home_score=None, away_score=None, spread_source="espn"):
    fav_id = {"home": "H" + game_id, "away": "A" + game_id, None: None}[favorite]
    return {
        "game_id": game_id, "season": SEASON, "week": week, "name": f"Away {game_id} at Home {game_id}",
        "short_name": f"A{game_id} @ H{game_id}", "kickoff": kickoff, "status": status,
        "status_detail": "Final" if status == "post" else None,
        "home_team_id": "H" + game_id, "home_name": f"Home {game_id}", "home_abbr": "H" + game_id,
        "home_logo": None, "home_color": None, "home_rank": None, "home_score": home_score,
        "away_team_id": "A" + game_id, "away_name": f"Away {game_id}", "away_abbr": "A" + game_id,
        "away_logo": None, "away_color": None, "away_rank": None, "away_score": away_score,
        "spread": spread, "favorite_team_id": fav_id, "spread_source": spread_source,
        "venue": None, "broadcast": None,
    }


class _DbTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.conn, self.path = _fresh_db()
        settings.season_first_week = 1   # most tests play in week 1
        set_setting(self.conn, "week_override", 1)

    def tearDown(self):
        try:
            self.conn.close()
        finally:
            if os.path.exists(self.path):
                os.remove(self.path)

    def add_user(self, user_id, name, active=1, pending=0):
        self.conn.execute(
            "INSERT INTO users (user_id, email, username, display_name, password_hash, is_admin, is_active, "
            "pending_approval, created_at, updated_at) VALUES (?,?,?,?,?,0,?,?,?,?)",
            (user_id, f"{user_id}@test.com", name, name, "x", active, pending, "2026-01-01", "2026-01-01"))
        self.conn.commit()

    def add_game(self, **kw):
        upsert_games(self.conn, [game_row(**kw)])

    def add_pick(self, user_id, game_id, team_id, spread, week=1, result=None):
        self.conn.execute(
            "INSERT INTO picks (pick_id, user_id, season, week, game_id, team_id, locked_spread, result, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (f"p-{user_id}-{week}", user_id, SEASON, week, game_id, team_id, spread, result, "2026-01-01", "2026-01-01"))
        self.conn.commit()

    def game(self, game_id):
        return dict(self.conn.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone())

    def pick_result(self, user_id, week=1):
        return self.conn.execute("SELECT result FROM picks WHERE user_id = ? AND week = ?", (user_id, week)).fetchone()[0]


# ── The rule itself ──────────────────────────────────────────────────────────

class TestResolveResult(unittest.TestCase):
    def test_outright_win_is_upset(self):
        self.assertEqual(resolve_result(24, 21, 6.5), "upset")

    def test_lose_by_less_than_spread_covers(self):
        self.assertEqual(resolve_result(21, 24, 6.5), "cover")

    def test_lose_by_exactly_spread_pushes(self):
        self.assertEqual(resolve_result(21, 28, 7), "push")

    def test_lose_by_more_than_spread_loses(self):
        self.assertEqual(resolve_result(14, 28, 6.5), "loss")

    def test_tie_game_covers(self):
        self.assertEqual(resolve_result(20, 20, 3), "cover")

    def test_missing_scores_pending(self):
        self.assertIsNone(resolve_result(None, 10, 3))
        self.assertIsNone(resolve_result(10, None, 3))

    def test_resolve_pick_maps_sides(self):
        g = game_row("g", status="post", home_score=10, away_score=31, favorite="home")
        self.assertEqual(resolve_pick(g, "Ag", 6.5), "upset")   # away dog won
        self.assertEqual(resolve_pick(g, "Hg", 6.5), "loss")    # resolves from whichever side you name
        g2 = game_row("g", status="pre")
        self.assertIsNone(resolve_pick(g2, "Ag", 6.5))           # not final yet

    def test_underdog_and_kickoff_helpers(self):
        self.assertEqual(underdog_team_id(game_row("g", favorite="home")), "Ag")
        self.assertEqual(underdog_team_id(game_row("g", favorite="away")), "Hg")
        self.assertIsNone(underdog_team_id(game_row("g", spread=0, favorite=None)))
        self.assertIsNone(underdog_team_id(game_row("g", spread=None, favorite=None)))
        self.assertFalse(has_kicked_off(game_row("g", kickoff=FUTURE)))
        self.assertTrue(has_kicked_off(game_row("g", kickoff=PAST)))
        self.assertTrue(has_kicked_off(game_row("g", kickoff=FUTURE, status="in")))


class TestPoints(unittest.TestCase):
    """The on-air graphic: 5 for a cover, 5 + spread for an upset, 1 for a push."""

    def test_cover_is_five(self):
        self.assertEqual(points_for("cover", 6.5), 5.0)
        self.assertEqual(points_for("cover", 24.5), 5.0)

    def test_upset_is_five_plus_spread(self):
        self.assertEqual(points_for("upset", 6.5), 11.5)
        self.assertEqual(points_for("upset", 10), 15.0)

    def test_push_is_one_and_loss_is_zero(self):
        self.assertEqual(points_for("push", 7), 1.0)
        self.assertEqual(points_for("loss", 7), 0.0)

    def test_pending_is_none(self):
        self.assertIsNone(points_for(None, 7))

    def test_minimum_spread_gates_eligibility(self):
        self.assertTrue(is_eligible(game_row("g", spread=4.5)))
        self.assertFalse(is_eligible(game_row("g", spread=4)))
        self.assertFalse(is_eligible(game_row("g", spread=None, favorite=None)))
        v = game_view(game_row("g", spread=3))
        self.assertEqual(v["underdog_team_id"], "Ag")   # there is a dog…
        self.assertFalse(v["eligible"])                  # …just not a SuperDog
        self.assertFalse(v["pickable"])
        self.assertTrue(game_view(game_row("g", spread=4.5))["pickable"])


# ── ESPN parsing ─────────────────────────────────────────────────────────────

def espn_event(event_id, home, away, state="pre", odds=None, home_score=None, away_score=None, week=1):
    def comp(team_id, abbr, name, side, score, rank=99):
        return {"homeAway": side, "score": score, "curatedRank": {"current": rank},
                "team": {"id": team_id, "abbreviation": abbr, "displayName": name, "logo": f"{abbr}.png", "color": "112233"}}
    return {
        "id": event_id, "name": f"{away[2]} at {home[2]}", "shortName": f"{away[1]} @ {home[1]}",
        "date": "2026-09-12T19:30Z", "week": {"number": week},
        "status": {"type": {"state": state, "shortDetail": "Final" if state == "post" else "9/12 - 3:30 PM EDT"}},
        "competitions": [{
            "competitors": [comp(*home[:3], "home", home_score, rank=home[3] if len(home) > 3 else 99),
                            comp(*away[:3], "away", away_score)],
            "odds": [odds] if odds else [],
            "venue": {"fullName": "The Stadium"}, "broadcasts": [{"names": ["ESPN"]}],
        }],
    }


class TestParseEvents(unittest.TestCase):
    def test_flag_based_favorite(self):
        odds = {"spread": 6.5, "details": "MIZ -6.5",
                "homeTeamOdds": {"favorite": False}, "awayTeamOdds": {"favorite": True}}
        ev = espn_event("1", ("2305", "KU", "Kansas Jayhawks", 12), ("142", "MIZ", "Missouri Tigers"), odds=odds)
        g = espn.parse_events({"events": [ev]}, 2026, 1)[0]
        self.assertEqual(g["spread"], 6.5)
        self.assertEqual(g["favorite_team_id"], "142")
        self.assertEqual(underdog_team_id(g), "2305")
        self.assertEqual(g["home_rank"], 12)
        self.assertIsNone(g["away_rank"])
        self.assertIsNone(g["home_score"])       # pre-game: no score
        self.assertEqual(g["broadcast"], "ESPN")

    def test_details_fallback_and_negative_spread(self):
        odds = {"spread": -3.5, "details": "KU -3.5"}
        ev = espn_event("1", ("2305", "KU", "Kansas"), ("142", "MIZ", "Missouri"), odds=odds)
        g = espn.parse_events({"events": [ev]}, 2026, 1)[0]
        self.assertEqual(g["spread"], 3.5)
        self.assertEqual(g["favorite_team_id"], "2305")

    def test_pickem_has_no_dog(self):
        odds = {"spread": 0, "details": "EVEN"}
        ev = espn_event("1", ("1", "A", "A"), ("2", "B", "B"), odds=odds)
        g = espn.parse_events({"events": [ev]}, 2026, 1)[0]
        self.assertEqual(g["spread"], 0.0)
        self.assertIsNone(g["favorite_team_id"])
        self.assertIsNone(underdog_team_id(g))

    def test_no_odds_and_final_scores(self):
        ev = espn_event("1", ("1", "A", "A"), ("2", "B", "B"), state="post", home_score="24", away_score="27")
        g = espn.parse_events({"events": [ev]}, 2026, 1)[0]
        self.assertIsNone(g["spread"])
        self.assertEqual(g["status"], "post")
        self.assertEqual((g["home_score"], g["away_score"]), (24, 27))

    def test_garbage_is_skipped(self):
        self.assertEqual(espn.parse_events({}, 2026, 1), [])
        self.assertEqual(espn.parse_events({"events": [{"id": "x"}]}, 2026, 1), [])

    def test_calendar(self):
        data = {"leagues": [{"calendar": [
            {"label": "Regular Season", "value": "2", "entries": [
                {"label": "Week 1", "value": "1", "startDate": "2026-08-22T07:00Z", "endDate": "2026-09-08T06:59Z"},
                {"label": "Week 2", "value": "2", "startDate": "2026-09-08T07:00Z", "endDate": "2026-09-14T06:59Z"}]},
            {"label": "Postseason", "value": "3", "entries": [{"label": "Bowls", "value": "1"}]},
        ]}]}
        weeks = espn.parse_calendar(data)
        self.assertEqual([w["week"] for w in weeks], [1, 2])


# ── Sync: spreads freeze, finals stick, picks settle ─────────────────────────

class TestSync(_DbTest):
    async def test_line_moves_before_kickoff_then_freezes(self):
        self.add_game(game_id="g", spread=6.5)
        self.add_game(game_id="g", spread=7.5)
        self.assertEqual(self.game("g")["spread"], 7.5)
        # ESPN drops the line: keep ours
        upsert_games(self.conn, [game_row("g", spread=None, favorite=None)])
        self.assertEqual(self.game("g")["spread"], 7.5)
        # Game goes live: frozen from here on
        upsert_games(self.conn, [game_row("g", status="in", spread=9.5)])
        self.assertEqual(self.game("g")["spread"], 7.5)
        upsert_games(self.conn, [game_row("g", status="post", spread=None, favorite=None, home_score=30, away_score=20)])
        g = self.game("g")
        self.assertEqual((g["spread"], g["favorite_team_id"], g["status"]), (7.5, "Hg", "post"))

    async def test_manual_spread_is_never_overwritten(self):
        self.add_game(game_id="g", spread=6.5)
        self.conn.execute("UPDATE games SET spread = 10, spread_source = 'manual' WHERE game_id = 'g'")
        self.conn.commit()
        upsert_games(self.conn, [game_row("g", spread=3)])
        self.assertEqual(self.game("g")["spread"], 10)
        self.assertEqual(self.game("g")["spread_source"], "manual")

    async def test_final_never_unfinals(self):
        self.add_game(game_id="g", status="post", home_score=21, away_score=28)
        upsert_games(self.conn, [game_row("g", status="in", home_score=14, away_score=14)])
        g = self.game("g")
        self.assertEqual((g["status"], g["home_score"], g["away_score"]), ("post", 21, 28))

    async def test_resolve_picks_only_settles_finals(self):
        self.add_user("u1", "Bryan K")
        self.add_user("u2", "Mike T")
        self.add_game(game_id="a", status="post", home_score=20, away_score=17)   # dog (away) lost by 3, spread 6.5 → cover
        self.add_game(game_id="b", status="in")
        self.add_pick("u1", "a", "Aa", 6.5)
        self.add_pick("u2", "b", "Ab", 6.5)
        self.assertEqual(resolve_picks(self.conn, SEASON), 1)
        self.assertEqual(self.pick_result("u1"), "cover")
        self.assertIsNone(self.pick_result("u2"))

    async def test_resolve_uses_locked_spread_not_current(self):
        self.add_user("u1", "Bryan K")
        self.add_game(game_id="a", status="post", home_score=27, away_score=20, spread=3.5)  # margin 7
        self.add_pick("u1", "a", "Aa", 7.5)   # locked at +7.5 earlier in the week → cover
        resolve_picks(self.conn, SEASON)
        self.assertEqual(self.pick_result("u1"), "cover")

    async def test_force_resettles_after_score_correction(self):
        self.add_user("u1", "Bryan K")
        self.add_game(game_id="a", status="post", home_score=30, away_score=10)
        self.add_pick("u1", "a", "Aa", 6.5)
        resolve_picks(self.conn, SEASON)
        self.assertEqual(self.pick_result("u1"), "loss")
        self.conn.execute("UPDATE games SET home_score = 10, away_score = 30 WHERE game_id = 'a'")
        self.conn.commit()
        self.assertEqual(resolve_picks(self.conn, SEASON), 0)            # already settled
        self.assertEqual(resolve_picks(self.conn, SEASON, force=True), 1)
        self.assertEqual(self.pick_result("u1"), "upset")


class TestCurrentWeek(_DbTest):
    def test_override_wins(self):
        set_setting(self.conn, "week_override", 7)
        self.assertEqual(current_week(self.conn, SEASON), 7)

    def test_calendar_lookup(self):
        set_setting(self.conn, "week_override", None)
        fmt = "%Y-%m-%dT%H:%MZ"
        upsert_weeks(self.conn, SEASON, [
            {"week": 1, "label": "Week 1", "start_date": (NOW - timedelta(days=10)).strftime(fmt), "end_date": (NOW - timedelta(days=3)).strftime(fmt)},
            {"week": 2, "label": "Week 2", "start_date": (NOW - timedelta(days=3)).strftime(fmt), "end_date": (NOW + timedelta(days=4)).strftime(fmt)},
            {"week": 3, "label": "Week 3", "start_date": (NOW + timedelta(days=4)).strftime(fmt), "end_date": (NOW + timedelta(days=11)).strftime(fmt)},
        ])
        self.assertEqual(current_week(self.conn, SEASON), 2)
        self.assertEqual(current_week(self.conn, SEASON, NOW - timedelta(days=5)), 1)
        self.assertEqual(current_week(self.conn, SEASON, NOW + timedelta(days=6)), 3)
        self.assertEqual(current_week(self.conn, SEASON, NOW + timedelta(days=60)), 3)  # past the end: last week
        self.assertEqual(current_week(self.conn, SEASON, NOW - timedelta(days=60)), 1)  # before the season: first week


class TestFirstWeek(_DbTest):
    """The 2026 pool starts in week 2 — week 1 must vanish everywhere."""

    def setUp(self):
        super().setUp()
        settings.season_first_week = 2
        set_setting(self.conn, "week_override", None)
        fmt = "%Y-%m-%dT%H:%MZ"
        upsert_weeks(self.conn, SEASON, [
            {"week": 1, "label": "Week 1", "start_date": (NOW - timedelta(days=3)).strftime(fmt), "end_date": (NOW + timedelta(days=4)).strftime(fmt)},
            {"week": 2, "label": "Week 2", "start_date": (NOW + timedelta(days=4)).strftime(fmt), "end_date": (NOW + timedelta(days=11)).strftime(fmt)},
            {"week": 3, "label": "Week 3", "start_date": (NOW + timedelta(days=11)).strftime(fmt), "end_date": (NOW + timedelta(days=18)).strftime(fmt)},
        ])

    def tearDown(self):
        settings.season_first_week = 1
        super().tearDown()

    def test_week_one_is_hidden_from_the_calendar(self):
        from app.services.season_service import list_weeks
        self.assertEqual([w["week"] for w in list_weeks(self.conn, SEASON)], [2, 3])

    def test_board_sits_on_week_two_while_calendar_says_one(self):
        self.assertEqual(current_week(self.conn, SEASON), 2)
        set_setting(self.conn, "week_override", 1)   # even a pin can't go earlier
        self.assertEqual(current_week(self.conn, SEASON), 2)
        set_setting(self.conn, "week_override", 3)
        self.assertEqual(current_week(self.conn, SEASON), 3)

    async def test_picks_go_on_week_two_games_only(self):
        import uuid
        uid = str(uuid.uuid5(uuid.NAMESPACE_DNS, "u1"))
        self.conn.execute(
            "INSERT INTO users (user_id, email, username, display_name, password_hash, is_admin, is_active, "
            "pending_approval, created_at, updated_at) VALUES (?,?,?,?,?,0,1,0,?,?)",
            (uid, "u1@test.com", "Bryan K", "Bryan K", "x", "2026-01-01", "2026-01-01"))
        self.conn.commit()
        user = UserResponse(user_id=uid, email="u1@test.com", username="Bryan K", display_name="Bryan K",
                            is_admin=False, is_active=True, created_at=datetime(2026, 1, 1))
        self.add_game(game_id="w1", week=1)
        self.add_game(game_id="w2", week=2)
        with self.assertRaises(HTTPException) as ctx:
            await picks_router.make_pick(picks_router.PickCreate(game_id="w1", team_id="Aw1"), current_user=user, session=self.conn)
        self.assertIn("this week", ctx.exception.detail)
        v = await picks_router.make_pick(picks_router.PickCreate(game_id="w2", team_id="Aw2"), current_user=user, session=self.conn)
        self.assertEqual(v["week"], 2)

    async def test_standings_ignore_week_one_picks(self):
        self.add_user("u1", "Bryan K")
        self.add_game(game_id="w1", week=1, status="post", home_score=10, away_score=20)
        self.add_pick("u1", "w1", "Aw1", 6.5)
        resolve_picks(self.conn, SEASON)
        s = compute_standings(self.conn, SEASON)
        self.assertEqual((s[0]["wins"], s[0]["picks_made"], s[0]["points"]), (0, 0, 0.0))


# ── Making picks: the rules of engagement ────────────────────────────────────

class TestMakePick(_DbTest):
    async def pick(self, user, game_id, team_id):
        return await picks_router.make_pick(picks_router.PickCreate(game_id=game_id, team_id=team_id), current_user=user, session=self.conn)

    def uid(self, user):
        return str(user.user_id)

    async def test_happy_path_locks_spread(self):
        u = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a", spread=6.5)
        v = await self.pick(u, "a", "Aa")
        self.assertEqual(v["team_id"], "Aa")
        self.assertEqual(v["locked_spread"], 6.5)
        self.assertEqual(v["team_name"], "Away a")
        self.assertEqual(v["opponent_name"], "Home a")

    async def test_favorite_is_rejected(self):
        u = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a")
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u, "a", "Ha")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("underdog", ctx.exception.detail)

    async def test_under_minimum_spread_is_rejected(self):
        u = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a", spread=3.5)
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u, "a", "Aa")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("at least +4.5", ctx.exception.detail)
        self.add_game(game_id="b", spread=4.5)
        v = await self.pick(u, "b", "Ab")            # exactly the minimum is fine
        self.assertEqual(v["locked_spread"], 4.5)

    async def test_no_line_is_rejected(self):
        u = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a", spread=None, favorite=None)
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u, "a", "Aa")
        self.assertIn("No line", ctx.exception.detail)

    async def test_kicked_off_is_rejected(self):
        u = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a", kickoff=PAST)
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u, "a", "Aa")
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_wrong_week_is_rejected(self):
        u = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a", week=2)
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u, "a", "Aa")
        self.assertIn("this week", ctx.exception.detail)

    async def test_first_to_lock_it_in_gets_it(self):
        u1 = self.add_user_full("u1", "Bryan K")
        u2 = self.add_user_full("u2", "Mike T")
        self.add_game(game_id="a")
        await self.pick(u1, "a", "Aa")
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u2, "a", "Aa")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("already taken", ctx.exception.detail)

    async def test_switching_frees_the_old_dog(self):
        u1 = self.add_user_full("u1", "Bryan K")
        u2 = self.add_user_full("u2", "Mike T")
        self.add_game(game_id="a")
        self.add_game(game_id="b", spread=10)
        await self.pick(u1, "a", "Aa")
        v = await self.pick(u1, "b", "Ab")          # switch
        self.assertEqual(v["locked_spread"], 10)
        count = self.conn.execute("SELECT COUNT(*) FROM picks WHERE user_id = ?", (self.uid(u1),)).fetchone()[0]
        self.assertEqual(count, 1)                   # still one pick
        await self.pick(u2, "a", "Aa")               # dog "a" is available again

    async def test_cannot_switch_once_your_game_started(self):
        u1 = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a")
        self.add_game(game_id="b")
        await self.pick(u1, "a", "Aa")
        self.conn.execute("UPDATE games SET status = 'in' WHERE game_id = 'a'")
        self.conn.commit()
        with self.assertRaises(HTTPException) as ctx:
            await self.pick(u1, "b", "Ab")
        self.assertIn("locked", ctx.exception.detail)
        with self.assertRaises(HTTPException):
            await picks_router.drop_pick(current_user=u1, session=self.conn)

    async def test_drop_pick(self):
        u1 = self.add_user_full("u1", "Bryan K")
        self.add_game(game_id="a")
        await self.pick(u1, "a", "Aa")
        await picks_router.drop_pick(current_user=u1, session=self.conn)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM picks").fetchone()[0], 0)

    def add_user_full(self, user_id, name):
        """Users whose user_id is a real UUID string (the router compares str(user.user_id))."""
        import uuid
        uid = str(uuid.uuid5(uuid.NAMESPACE_DNS, user_id))
        self.conn.execute(
            "INSERT INTO users (user_id, email, username, display_name, password_hash, is_admin, is_active, "
            "pending_approval, created_at, updated_at) VALUES (?,?,?,?,?,0,1,0,?,?)",
            (uid, f"{user_id}@test.com", name, name, "x", "2026-01-01", "2026-01-01"))
        self.conn.commit()
        return UserResponse(user_id=uid, email=f"{user_id}@test.com", username=name, display_name=name,
                            is_admin=False, is_active=True, created_at=datetime(2026, 1, 1))


# ── Standings ────────────────────────────────────────────────────────────────

class TestStandings(_DbTest):
    async def test_ranking_by_points_then_upsets(self):
        for uid, name in [("u1", "Bryan K"), ("u2", "Mike T"), ("u3", "Dan S"), ("u4", "Zed Q")]:
            self.add_user(uid, name)
        # Week 1 finals
        self.add_game(game_id="a", status="post", home_score=10, away_score=20)   # away dog upset  -> 5 + 6.5
        self.add_game(game_id="b", status="post", home_score=20, away_score=17)   # away dog cover  -> 5
        self.add_game(game_id="c", status="post", home_score=30, away_score=3)    # away dog loss   -> 0
        self.add_pick("u1", "a", "Aa", 6.5)
        self.add_pick("u2", "b", "Ab", 6.5)
        self.add_pick("u3", "c", "Ac", 6.5)
        resolve_picks(self.conn, SEASON)

        s = compute_standings(self.conn, SEASON)
        self.assertEqual([e["name"] for e in s], ["Bryan K", "Mike T", "Zed Q", "Dan S"])
        self.assertEqual([e["points"] for e in s], [11.5, 5.0, 0.0, 0.0])
        # Zed (0-0) and Dan (0-1) both sit on 0 points: tied at 3rd, Zed listed first on fewer losses
        self.assertEqual([e["rank"] for e in s], [1, 2, 3, 3])
        self.assertEqual([e["tied"] for e in s], [False, False, True, True])
        self.assertEqual([e["record"] for e in s], ["1-0", "1-0", "0-0", "0-1"])
        self.assertEqual((s[0]["upsets"], s[1]["covers"]), (1, 1))
        self.assertEqual(s[0]["picks"][0]["points"], 11.5)

    async def test_big_dog_cover_ties_small_dog_cover_but_upset_scales(self):
        self.add_user("u1", "Bryan K")
        self.add_user("u2", "Mike T")
        self.add_game(game_id="a", status="post", home_score=21, away_score=24, spread=24.5)  # +24.5 dog wins -> 29.5
        self.add_game(game_id="b", status="post", home_score=21, away_score=17, spread=24.5)  # +24.5 dog covers -> 5
        self.add_pick("u1", "a", "Aa", 24.5)
        self.add_pick("u2", "b", "Ab", 24.5)
        resolve_picks(self.conn, SEASON)
        s = compute_standings(self.conn, SEASON)
        self.assertEqual([(e["name"], e["points"]) for e in s], [("Bryan K", 29.5), ("Mike T", 5.0)])

    async def test_tie_flags_and_records(self):
        self.add_user("u1", "Bryan K")
        self.add_user("u2", "Mike T")
        self.add_game(game_id="a", status="post", home_score=10, away_score=20)
        self.add_game(game_id="b", status="post", home_score=11, away_score=21, week=2)
        self.add_pick("u1", "a", "Aa", 6.5)
        self.add_pick("u2", "b", "Ab", 6.5, week=2)
        resolve_picks(self.conn, SEASON)
        s = compute_standings(self.conn, SEASON)
        self.assertTrue(all(e["tied"] for e in s))
        self.assertEqual([e["rank"] for e in s], [1, 1])
        self.assertEqual(s[0]["record"], "1-0")

    async def test_push_shows_in_record(self):
        self.add_user("u1", "Bryan K")
        self.add_game(game_id="a", status="post", home_score=27, away_score=20, spread=7)
        self.add_pick("u1", "a", "Aa", 7)
        resolve_picks(self.conn, SEASON)
        s = compute_standings(self.conn, SEASON)
        self.assertEqual(s[0]["record"], "0-0-1")
        self.assertEqual(s[0]["pushes"], 1)
        self.assertEqual(s[0]["points"], 1.0)

    async def test_unstarted_picks_are_hidden_from_others(self):
        self.add_user("u1", "Bryan K")
        self.add_user("u2", "Mike T")
        self.add_game(game_id="a", kickoff=FUTURE)
        self.add_pick("u1", "a", "Aa", 6.5)
        mine = compute_standings(self.conn, SEASON, viewer_id="u1")
        theirs = compute_standings(self.conn, SEASON, viewer_id="u2")
        admin = compute_standings(self.conn, SEASON, viewer_id="u2", viewer_is_admin=True)
        me = next(e for e in mine if e["user_id"] == "u1")
        them = next(e for e in theirs if e["user_id"] == "u1")
        adm = next(e for e in admin if e["user_id"] == "u1")
        self.assertEqual(me["picks"][0]["team_name"], "Away a")
        self.assertTrue(them["picks"][0]["hidden"])
        self.assertIsNone(them["picks"][0]["team_name"])
        self.assertFalse(adm["picks"][0]["hidden"])
        self.assertEqual(them["pending"], 1)

    async def test_inactive_and_pending_users_excluded(self):
        self.add_user("u1", "Bryan K")
        self.add_user("u2", "Ghost A", active=0)
        self.add_user("u3", "Newbie B", active=0, pending=1)
        s = compute_standings(self.conn, SEASON)
        self.assertEqual([e["name"] for e in s], ["Bryan K"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
