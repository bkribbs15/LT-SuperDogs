"""
Email nudges: "no dog yet" reminders before the week's first kickoff, and a
result note when a pick settles. Everything is a no-op until SMTP_HOST is set.
"""
import asyncio
import logging
import smtplib
from datetime import datetime
from email.message import EmailMessage
from typing import Optional
from zoneinfo import ZoneInfo

from app.config import settings
from app.database import db
from app.services.season_service import (
    current_season, current_week, first_week, parse_ts, utcnow, is_eligible, WIN_RESULTS,
)
from app.services.pick_views import pick_view

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send_email_sync(to: str, subject: str, text: str, html: Optional[str] = None) -> bool:
    """Deliver one message over SMTP. False (and a log line) if not configured."""
    if not email_configured():
        logger.info(f"[email disabled] to={to} subject={subject!r}")
        return False
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
        if settings.smtp_use_tls:
            s.starttls()
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password or "")
        s.send_message(msg)
    return True


# Swapped out by tests
_sender = send_email_sync


def _local(iso: Optional[str]) -> str:
    dt = parse_ts(iso)
    if not dt:
        return "TBD"
    try:
        dt = dt.astimezone(ZoneInfo(settings.display_timezone))
    except Exception:
        pass
    return dt.strftime("%a %-I:%M %p %Z")


def _wrap(title: str, lines: list[str], cta: Optional[tuple[str, str]] = None) -> tuple[str, str]:
    text = title + "\n\n" + "\n".join(lines) + ("\n\n" + f"{cta[0]}: {cta[1]}" if cta else "") + "\n\n— LT SuperDogs"
    body = "".join(f"<p style=\"margin:0 0 10px\">{l}</p>" for l in lines)
    button = (f"<p style=\"margin:22px 0\"><a href=\"{cta[1]}\" style=\"background:#E4572E;color:#fff;padding:12px 20px;"
              f"border-radius:10px;text-decoration:none;font-weight:700\">{cta[0]}</a></p>") if cta else ""
    html = (f"<div style=\"font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#141A26\">"
            f"<div style=\"font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#E4572E;font-weight:700\">LT SuperDogs</div>"
            f"<h2 style=\"margin:6px 0 16px;font-size:24px\">{title}</h2>{body}{button}"
            f"<p style=\"color:#8791A0;font-size:12px\">You can turn these emails off under Profile &amp; Settings.</p></div>")
    return text, html


# ── what's due ─────────────────────────────────────────────────────────────

def _reminder_kind(hours_left: float) -> Optional[str]:
    windows = sorted(float(h) for h in settings.reminder_hours.split(",") if h.strip())
    for h in windows:
        if hours_left <= h:
            return f"reminder_{int(h)}h"
    return None


def due_reminders(session, now: Optional[datetime] = None) -> list[dict]:
    """Players with no pick this week, inside a reminder window before the
    week's first eligible kickoff, who haven't had this window's nudge."""
    now = now or utcnow()
    season = current_season(now)
    week = current_week(session, season, now)
    games = [dict(r) for r in session.execute(
        "SELECT * FROM games WHERE season = ? AND week = ? AND status = 'pre'", (season, week)).fetchall()]
    upcoming = [parse_ts(g["kickoff"]) for g in games if is_eligible(g) and g.get("kickoff") and parse_ts(g["kickoff"]) > now]
    if not upcoming:
        return []
    first = min(upcoming)
    kind = _reminder_kind((first - now).total_seconds() / 3600)
    if not kind:
        return []
    rows = session.execute(
        "SELECT u.user_id, u.email, COALESCE(u.display_name, u.username) AS name FROM users u "
        "WHERE u.is_active = 1 AND u.pending_approval = 0 AND u.email_reminders = 1 "
        "AND NOT EXISTS (SELECT 1 FROM picks p WHERE p.user_id = u.user_id AND p.season = ? AND p.week = ?) "
        "AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.user_id AND n.season = ? AND n.week = ? AND n.kind = ?)",
        (season, week, season, week, kind)).fetchall()
    dogs_left = sum(1 for g in games if is_eligible(g) and parse_ts(g["kickoff"]) > now)
    return [{"user_id": r["user_id"], "email": r["email"], "name": r["name"], "kind": kind,
             "season": season, "week": week, "first_kickoff": first.isoformat(), "dogs_left": dogs_left} for r in rows]


def due_results(session) -> list[dict]:
    """Settled picks whose owner wants result emails and hasn't had one."""
    rows = session.execute(
        "SELECT p.*, u.email, COALESCE(u.display_name, u.username) AS user_name FROM picks p "
        "JOIN users u ON u.user_id = p.user_id "
        "WHERE p.result IS NOT NULL AND p.result != 'void' AND u.is_active = 1 AND u.email_results = 1 "
        "AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = p.user_id AND n.season = p.season "
        "AND n.week = p.week AND n.kind = 'result')").fetchall()
    out = []
    for r in rows:
        p = dict(r)
        game = session.execute("SELECT * FROM games WHERE game_id = ?", (p["game_id"],)).fetchone()
        if not game:
            continue
        v = pick_view(p, dict(game), p["user_name"])
        v["email"] = p["email"]
        out.append(v)
    return out


def _mark(session, user_id: str, season: int, week: int, kind: str):
    session.execute(
        "INSERT OR REPLACE INTO notifications (user_id, season, week, kind, sent_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, season, week, kind, utcnow().isoformat()))
    session.commit()


# ── message builders ───────────────────────────────────────────────────────

def reminder_message(r: dict) -> tuple[str, str, str]:
    hours = r["kind"].split("_")[1]
    subject = f"No dog yet for Week {r['week']} — first kick in {hours}"
    text, html = _wrap(
        f"{r['name'].split(' ')[0]}, you haven't picked a SuperDog.",
        [f"Week {r['week']}'s first eligible kickoff is {_local(r['first_kickoff'])}.",
         f"{r['dogs_left']} underdogs are still on the board. First to lock one in owns it."],
        ("Pick your dog", f"{settings.frontend_url.rstrip('/')}/board"))
    return subject, text, html


def result_message(v: dict) -> tuple[str, str, str]:
    pts = v.get("points") or 0
    pts_s = f"{pts:g}"
    label = {"upset": "won outright", "cover": "covered", "push": "pushed", "loss": "didn't cover"}[v["result"]]
    subject = f"Week {v['week']}: {v['team_abbr']} {label} — {pts_s} point{'s' if pts != 1 else ''}"
    score = f"{v['team_abbr']} {v['team_score']} – {v['opponent_abbr']} {v['opponent_score']}"
    verdict = {
        "upset": f"Your +{v['locked_spread']:g} dog won the game outright. That's 5 + the spread: {pts_s} points.",
        "cover": f"Lost, but by less than the {v['locked_spread']:g}-point spread. 5 points.",
        "push": f"Lost by exactly the spread. 1 point for the push.",
        "loss": f"Didn't cover the {v['locked_spread']:g}. No points this week.",
    }[v["result"]]
    text, html = _wrap(
        f"{v['team_name']} {label}.",
        [f"Final: {score}.", verdict],
        ("See the standings", f"{settings.frontend_url.rstrip('/')}/standings"))
    return subject, text, html


# ── the job ────────────────────────────────────────────────────────────────

async def run_notifications() -> dict:
    if not email_configured():
        return {"sent": 0, "skipped": "email not configured"}
    session = db.get_session()
    sent = 0
    for r in due_reminders(session):
        subject, text, html = reminder_message(r)
        try:
            ok = await asyncio.to_thread(_sender, r["email"], subject, text, html)
        except Exception as e:
            logger.warning(f"Reminder to {r['email']} failed: {e}")
            continue
        if ok:
            _mark(session, r["user_id"], r["season"], r["week"], r["kind"])
            sent += 1
    for v in due_results(session):
        subject, text, html = result_message(v)
        try:
            ok = await asyncio.to_thread(_sender, v["email"], subject, text, html)
        except Exception as e:
            logger.warning(f"Result email to {v['email']} failed: {e}")
            continue
        if ok:
            _mark(session, v["user_id"], v["season"], v["week"], "result")
            sent += 1
    if sent:
        logger.info(f"Sent {sent} notification email(s)")
    return {"sent": sent}


async def send_test_email(to: str) -> dict:
    if not email_configured():
        return {"configured": False, "sent": False, "message": "SMTP isn't configured — set SMTP_HOST, SMTP_FROM (and user/password) in backend/.env"}
    text, html = _wrap("Test email from LT SuperDogs", ["If you can read this, reminders and result emails will work."],
                       ("Open the board", f"{settings.frontend_url.rstrip('/')}/board"))
    try:
        await asyncio.to_thread(_sender, to, "LT SuperDogs test email", text, html)
    except Exception as e:
        return {"configured": True, "sent": False, "message": f"SMTP error: {e}"}
    return {"configured": True, "sent": True, "message": f"Test email sent to {to}"}
