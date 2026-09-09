"""
Stats, recap, history, notifications and the public link. Same throwaway
SQLite approach as test_scoring.py; no network, no real email.
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-not-used-anywhere-real")

from fastapi import HTTPException  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import set_setting  # noqa: E402
from app.services.stats_service import player_stats, build_recap  # noqa: E402
from app.services import notify_service  # noqa: E402
from app.services.sync_service import resolve_picks, upsert_games  # noqa: E402
from app.routers.standings import season_picks, get_history, share_token  # noqa: E402
from app.routers import public as public_router  # noqa: E402
from app.schemas.user import UserResponse  # noqa: E402
from tests.test_scoring import _DbTest, game_row, SEASON, NOW, FUTURE, PAST  # noqa: E402


def pv(week, result, spread, points, conf=None, user_id="u1", user_name="Bryan K", abbr="DOG"):
    return {"week": week, "result": result, "locked_spread": spread, "points": points, "team_conf": conf,
            "user_id": user_id, "user_name": user_name, "team_abbr": abbr}


class TestPlayerStats(unittest.TestCase):
    def test_streaks_and_highlights(self):
        picks = [
            pv(2, "cover", 6.5, 5, "SEC"),
            pv(3, "loss", 10, 0, "Big Ten"),
            pv(4, "upset", 7, 12, "SEC"),
            pv(5, "upset", 21.5, 26.5, "ACC"),
            pv(6, "push", 3, 1, "SEC"),
            pv(7, None, 9, None, "Big 12"),   # pending
        ]
        s = player_stats(picks)
        self.assertEqual((s["picks_made"], s["settled"]), (6, 5))
        self.assertEqual(s["points"], 44.5)
        self.assertEqual((s["wins"], s["losses"], s["pushes"], s["upsets"]), (3, 1, 1, 2))
        self.assertEqual((s["current_streak"], s["longest_streak"]), (0, 2))   # push ended the run
        self.assertEqual(s["biggest_upset"]["locked_spread"], 21.5)
        self.assertEqual(s["best_week"], {"week": 5, "points": 26.5, "team_abbr": "DOG"})
        self.assertEqual(s["avg_spread"], 9.5)
        self.assertEqual(s["favorite_conference"], {"name": "SEC", "count": 3})

    def test_current_streak_counts_trailing_wins(self):
        s = player_stats([pv(2, "loss", 5, 0), pv(3, "cover", 5, 5), pv(4, "upset", 5, 10)])
        self.assertEqual((s["current_streak"], s["longest_streak"]), (2, 2))

    def test_empty(self):
        s = player_stats([])
        self.assertEqual(s["points"], 0)
        self.assertIsNone(s["avg_spread"])
        self.assertIsNone(s["biggest_upset"])


class TestRecap(unittest.TestCase):
    def test_latest_fully_settled_week(self):
        picks = [
            pv(2, "upset", 7, 12, user_id="u1", user_name="Bryan K"),
            pv(2, "cover", 20, 5, user_id="u2", user_name="Mike T"),
            pv(3, "upset", 14.5, 19.5, user_id="u1", user_name="Bryan K"),
            pv(3, "upset", 3, 8, user_id="u2", user_name="Mike T", abbr="BIG"),
            pv(4, "cover", 5, 5, user_id="u1", user_name="Bryan K"),
            pv(4, None, 5, None, user_id="u2", user_name="Mike T"),     # week 4 not done
        ]
        r = build_recap(picks)
        self.assertEqual(r["week"], 3)
        self.assertEqual(r["dog_of_week"]["user_name"], "Bryan K")
        self.assertEqual(r["biggest_upset"]["locked_spread"], 14.5)
        self.assertEqual((r["upsets"], r["covers"], r["losses"], r["points"]), (2, 0, 0, 27.5))
        # both won weeks 2 and 3 -> both on 2-week streaks
        self.assertEqual([(s["user_name"], s["streak"]) for s in r["hot_streaks"]], [("Bryan K", 2), ("Mike T", 2)])

    def test_none_until_something_settles(self):
        self.assertIsNone(build_recap([]))
        self.assertIsNone(build_recap([pv(2, None, 5, None)]))

    def test_voids_dont_block_a_week(self):
        r = build_recap([pv(2, "void", 5, 0, user_id="u1"), pv(2, "loss", 5, 0, user_id="u2", user_name="Mike T")])
        self.assertEqual(r["week"], 2)
        self.assertEqual(r["picks"], 1)


class TestNotifications(_DbTest):
    def setUp(self):
        super().setUp()
        self.sent = []
        self._orig = notify_service._sender
        notify_service._sender = lambda to, subject, text, html=None: (self.sent.append((to, subject)) or True)
        self._smtp = (settings.smtp_host, settings.smtp_from)
        settings.smtp_host, settings.smtp_from = "smtp.test", "SuperDogs <test@test>"

    def tearDown(self):
        notify_service._sender = self._orig
        settings.smtp_host, settings.smtp_from = self._smtp
        super().tearDown()

    def add_player(self, uid, name, reminders=1, results=1):
        self.conn.execute(
            "INSERT INTO users (user_id, email, username, display_name, password_hash, is_admin, is_active, "
            "pending_approval, email_reminders, email_results, created_at, updated_at) VALUES (?,?,?,?,?,0,1,0,?,?,?,?)",
            (uid, f"{uid}@test.com", name, name, "x", reminders, results, "2026-01-01", "2026-01-01"))
        self.conn.commit()

    def test_reminder_windows(self):
        self.add_player("u1", "Bryan K")
        self.add_player("u2", "Mike T")
        self.add_player("u3", "Opted Out", reminders=0)
        kick = (NOW + timedelta(hours=20)).strftime("%Y-%m-%dT%H:%MZ")
        self.add_game(game_id="a", kickoff=kick)
        self.add_pick("u2", "a", "Aa", 6.5)                       # Mike already picked
        due = notify_service.due_reminders(self.conn, NOW)
        self.assertEqual([(d["user_id"], d["kind"]) for d in due], [("u1", "reminder_24h")])
        self.assertEqual(due[0]["dogs_left"], 1)

    def test_no_reminder_outside_window_or_without_eligible_games(self):
        self.add_player("u1", "Bryan K")
        self.add_game(game_id="a", kickoff=(NOW + timedelta(hours=60)).strftime("%Y-%m-%dT%H:%MZ"))
        self.assertEqual(notify_service.due_reminders(self.conn, NOW), [])
        self.add_game(game_id="b", kickoff=(NOW + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%MZ"), spread=3)  # under the minimum
        self.assertEqual(notify_service.due_reminders(self.conn, NOW), [])

    async def test_run_sends_once_per_window_and_result_once(self):
        self.add_player("u1", "Bryan K")
        self.add_player("u2", "Mike T", results=0)
        self.add_game(game_id="a", kickoff=(NOW + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%MZ"))
        self.add_game(game_id="b", status="post", home_score=10, away_score=20)
        self.add_pick("u2", "b", "Ab", 6.5)
        resolve_picks(self.conn, SEASON)
        r = await notify_service.run_notifications()
        self.assertEqual(r["sent"], 1)                       # u1's 3h reminder; u2 opted out of results
        self.assertIn("first kick in 3h", self.sent[0][1])
        r = await notify_service.run_notifications()
        self.assertEqual(r["sent"], 0)                       # not twice
        # u1 now picks a game that settles -> exactly one result email
        self.add_pick("u1", "b", "Hb", 6.5)                  # the favorite side, just to reuse the game
        resolve_picks(self.conn, SEASON)
        r = await notify_service.run_notifications()
        self.assertEqual(r["sent"], 1)
        self.assertIn("Week 1:", self.sent[-1][1])
        self.assertEqual((await notify_service.run_notifications())["sent"], 0)

    async def test_disabled_without_smtp(self):
        settings.smtp_host = None
        self.add_player("u1", "Bryan K")
        self.add_game(game_id="a", kickoff=(NOW + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%MZ"))
        r = await notify_service.run_notifications()
        self.assertEqual(r["sent"], 0)
        self.assertEqual(self.sent, [])

    def test_result_message_math(self):
        v = {"week": 4, "team_abbr": "WKU", "team_name": "WKU Hilltoppers", "team_score": 24, "opponent_abbr": "UGA",
             "opponent_score": 17, "result": "upset", "locked_spread": 35.5, "points": 40.5}
        subject, text, html = notify_service.result_message(v)
        self.assertIn("40.5 points", subject)
        self.assertIn("5 + the spread", text)


class TestHistoryAndShare(_DbTest):
    def _user(self, uid="u1"):
        return UserResponse(user_id="00000000-0000-0000-0000-000000000001", email="x@test.com", username="X Y",
                            display_name="X Y", is_admin=False, is_active=True, created_at=datetime(2026, 1, 1))

    async def test_history_podium_and_flags(self):
        self.add_user("u1", "Bryan K")
        self.add_user("u2", "Mike T")
        self.add_game(game_id="a", status="post", home_score=10, away_score=20)
        self.add_game(game_id="b", status="post", home_score=20, away_score=17)
        self.add_pick("u1", "a", "Aa", 6.5)
        self.add_pick("u2", "b", "Ab", 6.5)
        resolve_picks(self.conn, SEASON)
        # an old season with one pick
        self.conn.execute("INSERT INTO games (game_id, season, week, kickoff, status, home_team_id, away_team_id, home_score, away_score, spread, favorite_team_id) "
                          "VALUES ('old', ?, 1, '2020-09-05T00:00Z', 'post', 'H', 'A', 3, 30, 7, 'H')", (SEASON - 1,))
        self.conn.execute("INSERT INTO picks (pick_id, user_id, season, week, game_id, team_id, locked_spread, result) VALUES ('op', 'u2', ?, 1, 'old', 'A', 7, 'upset')", (SEASON - 1,))
        self.conn.commit()
        hist = await get_history(current_user=self._user(), session=self.conn)
        self.assertEqual([h["season"] for h in hist], [SEASON, SEASON - 1])
        self.assertFalse(hist[0]["complete"])
        self.assertTrue(hist[1]["complete"])
        self.assertEqual([p["name"] for p in hist[0]["podium"]], ["Bryan K", "Mike T"])
        self.assertEqual(hist[0]["podium"][0]["points"], 11.5)
        self.assertEqual(hist[1]["podium"][0]["name"], "Mike T")
        self.assertEqual(hist[1]["podium"][0]["points"], 12.0)

    async def test_share_token_and_public_view(self):
        self.add_user("u1", "Bryan K")
        self.add_game(game_id="a", kickoff=FUTURE)
        self.add_pick("u1", "a", "Aa", 6.5)
        token = share_token(self.conn)
        self.assertEqual(share_token(self.conn), token)             # stable
        self.assertNotEqual(share_token(self.conn, rotate=True), token)
        token = share_token(self.conn)

        class Req:  # slowapi needs something request-shaped; the limiter is bypassed when called directly
            headers = {}
            client = None
            url = None
        fn = public_router.public_standings.__wrapped__ if hasattr(public_router.public_standings, "__wrapped__") else public_router.public_standings
        data = await fn(request=Req(), token=token, session=self.conn)
        self.assertEqual(data["standings"][0]["name"], "Bryan K")
        self.assertTrue(data["standings"][0]["picks"][0]["hidden"])   # anonymous can't see unstarted picks
        with self.assertRaises(HTTPException):
            await fn(request=Req(), token="nope", session=self.conn)


if __name__ == "__main__":
    unittest.main(verbosity=2)
