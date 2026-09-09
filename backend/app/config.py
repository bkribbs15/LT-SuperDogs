from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App Settings
    app_name: str = "LT SuperDogs API"
    version: str = "1.0.0"
    debug: bool = False

    # JWT Settings
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200  # 30 days — keep phone users logged in

    # ESPN college football scoreboard (public, no key). Group 80 = FBS.
    cfb_api_url: str = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
    cfb_group: int = 80
    sync_interval_minutes: int = 10        # quiet cadence
    live_sync_interval_minutes: int = 2    # while any game this week is in play
    # Weeks before this are off the board entirely (the pool started in week 2
    # of 2026; ESPN's "week 1" also lumps in the week-0 games).
    season_first_week: int = 2

    # Email (optional). Leave SMTP_HOST empty and nothing is ever sent —
    # reminders/results just log. Any SMTP provider works (Gmail app password,
    # Fastmail, SendGrid SMTP, Postmark SMTP, ...).
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_use_tls: bool = True
    # Hours before the week's first kickoff to nudge players who haven't picked
    reminder_hours: str = "24,3"
    # Timezone used when writing kickoff times into emails
    display_timezone: str = "America/Chicago"

    # CORS Settings
    frontend_url: str = "http://localhost:5174"
    backend_url: str = "http://localhost:8101"

    # Admin Settings
    admin_email: str = "admin@superdogs.local"
    admin_password: str = "ChangeThisPassword123!"

    # Permanent owner / super-admin — always admin, cannot be demoted or deactivated
    owner_email: str = "bkribbs15@gmail.com"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()


def is_owner_email(email: Optional[str]) -> bool:
    """True if the given email is the permanent owner (case-insensitive)."""
    if not email:
        return False
    return email.strip().lower() == settings.owner_email.strip().lower()
