"""
Player stats, the weekly recap and season history — all computed from picks
(pick_view dicts), nothing stored.
"""
from collections import Counter, defaultdict
from typing import Optional

from app.services.season_service import WIN_RESULTS

SETTLED = ("upset", "cover", "loss", "push")


def _streaks(picks: list[dict]) -> tuple[int, int]:
    """(current, longest) run of winning weeks over settled picks in week order."""
    run = longest = 0
    for p in sorted((p for p in picks if p.get("result") in SETTLED), key=lambda p: p["week"]):
        if p["result"] in WIN_RESULTS:
            run += 1
            longest = max(longest, run)
        else:
            run = 0
    return run, longest


def player_stats(picks: list[dict]) -> dict:
    """One player's season in numbers. `picks` are pick_view dicts."""
    settled = [p for p in picks if p.get("result") in SETTLED]
    current, longest = _streaks(picks)
    upsets = [p for p in settled if p["result"] == "upset"]
    biggest_upset = max(upsets, key=lambda p: p["locked_spread"], default=None)
    best_week = max(settled, key=lambda p: p.get("points") or 0, default=None)
    confs = Counter(p.get("team_conf") for p in picks if p.get("team_conf"))
    fav = confs.most_common(1)[0] if confs else None
    return {
        "picks_made": len(picks),
        "settled": len(settled),
        "points": sum(p.get("points") or 0 for p in settled),
        "wins": sum(1 for p in settled if p["result"] in WIN_RESULTS),
        "losses": sum(1 for p in settled if p["result"] == "loss"),
        "pushes": sum(1 for p in settled if p["result"] == "push"),
        "upsets": len(upsets),
        "current_streak": current,
        "longest_streak": longest,
        "biggest_upset": biggest_upset,
        "best_week": {"week": best_week["week"], "points": best_week.get("points") or 0, "team_abbr": best_week.get("team_abbr")} if best_week else None,
        "avg_spread": round(sum(p["locked_spread"] for p in picks) / len(picks), 1) if picks else None,
        "favorite_conference": {"name": fav[0], "count": fav[1]} if fav else None,
    }


def build_recap(picks: list[dict]) -> Optional[dict]:
    """Recap of the latest week where every pick is settled. `picks` are
    pick_view dicts (with user_name) for a whole season."""
    by_week = defaultdict(list)
    for p in picks:
        by_week[p["week"]].append(p)
    done = [w for w, ps in by_week.items() if ps and all(p.get("result") in SETTLED or p.get("result") == "void" for p in ps)
            and any(p.get("result") in SETTLED for p in ps)]
    if not done:
        return None
    week = max(done)
    ps = [p for p in by_week[week] if p.get("result") in SETTLED]
    dog = max(ps, key=lambda p: (p.get("points") or 0, p["locked_spread"]))
    upsets = [p for p in ps if p["result"] == "upset"]
    biggest = max(upsets, key=lambda p: p["locked_spread"], default=None)
    counts = Counter(p["result"] for p in ps)

    # Hot streaks: consecutive winning weeks ending at this week, per player
    by_user = defaultdict(list)
    for p in picks:
        if p["week"] <= week:
            by_user[p["user_id"]].append(p)
    streaks = []
    for uid, ups in by_user.items():
        latest = max(ups, key=lambda p: p["week"])
        if latest["week"] != week or latest.get("result") not in WIN_RESULTS:
            continue
        current, _ = _streaks(ups)
        if current >= 2:
            streaks.append({"user_id": uid, "user_name": latest.get("user_name"), "streak": current})
    streaks.sort(key=lambda s: (-s["streak"], (s["user_name"] or "").lower()))

    return {
        "week": week,
        "picks": len(ps),
        "points": sum(p.get("points") or 0 for p in ps),
        "upsets": counts.get("upset", 0),
        "covers": counts.get("cover", 0),
        "pushes": counts.get("push", 0),
        "losses": counts.get("loss", 0),
        "dog_of_week": dog,
        "biggest_upset": biggest,
        "hot_streaks": streaks[:3],
    }
