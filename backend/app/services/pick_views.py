"""Shared JSON shapes for games and picks so every endpoint speaks the same dialect."""
from typing import Optional

from app.services.season_service import underdog_team_id, has_kicked_off, WIN_RESULTS


def team_side(game: dict, team_id: str) -> Optional[str]:
    if team_id == game.get("home_team_id"):
        return "home"
    if team_id == game.get("away_team_id"):
        return "away"
    return None


def game_view(game: dict) -> dict:
    """A game row plus derived fields the board needs."""
    g = dict(game)
    dog = underdog_team_id(g)
    started = has_kicked_off(g)
    g["underdog_team_id"] = dog
    g["kicked_off"] = started
    g["pickable"] = dog is not None and not started
    g.pop("last_updated", None)
    return g


def pick_view(pick: dict, game: dict, user_name: Optional[str] = None, hidden: bool = False) -> dict:
    """A pick with its team/opponent resolved from the game. `hidden` blanks the
    team so other players can't see who you took before kickoff."""
    side = team_side(game, pick["team_id"])
    opp = "away" if side == "home" else "home"
    started = has_kicked_off(game)
    result = pick.get("result")
    view = {
        "pick_id": pick["pick_id"],
        "user_id": pick["user_id"],
        "user_name": user_name,
        "season": pick["season"],
        "week": pick["week"],
        "game_id": pick["game_id"],
        "locked_spread": pick["locked_spread"],
        "result": result,
        "is_win": result in WIN_RESULTS if result else None,
        "kicked_off": started,
        "game_status": game.get("status"),
        "status_detail": game.get("status_detail"),
        "kickoff": game.get("kickoff"),
        "hidden": hidden,
        "created_at": pick.get("created_at"),
        "updated_at": pick.get("updated_at"),
    }
    if hidden:
        view.update({
            "team_id": None, "team_name": None, "team_abbr": None, "team_logo": None,
            "team_rank": None, "team_score": None, "side": None,
            "opponent_name": None, "opponent_abbr": None, "opponent_logo": None,
            "opponent_rank": None, "opponent_score": None, "short_name": None,
        })
        return view
    view.update({
        "team_id": pick["team_id"],
        "team_name": game.get(f"{side}_name"),
        "team_abbr": game.get(f"{side}_abbr"),
        "team_logo": game.get(f"{side}_logo"),
        "team_rank": game.get(f"{side}_rank"),
        "team_score": game.get(f"{side}_score"),
        "side": side,
        "opponent_id": game.get(f"{opp}_team_id"),
        "opponent_name": game.get(f"{opp}_name"),
        "opponent_abbr": game.get(f"{opp}_abbr"),
        "opponent_logo": game.get(f"{opp}_logo"),
        "opponent_rank": game.get(f"{opp}_rank"),
        "opponent_score": game.get(f"{opp}_score"),
        "short_name": game.get("short_name"),
    })
    return view


def can_see_pick(pick: dict, game: dict, viewer_id: str, viewer_is_admin: bool) -> bool:
    return viewer_is_admin or pick["user_id"] == viewer_id or has_kicked_off(game)
