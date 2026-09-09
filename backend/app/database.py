import os
import logging
import threading

logger = logging.getLogger(__name__)


class Database:
    """SQLite-backed database. A single schema, a single code path."""

    def __init__(self):
        self.session = None
        self._local = threading.local()  # per-thread SQLite connection
        self._sqlite_path = None

    def _open_sqlite(self):
        """Open a new SQLite connection (WAL + busy timeout for safe concurrency)."""
        import sqlite3
        conn = sqlite3.connect(self._sqlite_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @property
    def sqlite_conn(self):
        """Per-thread connection. A single shared connection isn't safe under
        FastAPI's threadpool — each thread gets its own."""
        if not self._sqlite_path:
            return None
        conn = getattr(self._local, 'conn', None)
        if conn is None:
            conn = self._open_sqlite()
            self._local.conn = conn
        return conn

    def connect(self):
        """Connect to the SQLite database and ensure the schema exists."""
        # SQLITE_DB_PATH lets the deploy point at a persistent volume; falls back
        # to a local file for development.
        self._sqlite_path = os.environ.get("SQLITE_DB_PATH") or os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "local_dev.db"
        )
        self.session = self.sqlite_conn  # opens this thread's connection
        logger.info(f"✓ Connected to SQLite database: {self._sqlite_path}")
        self._create_tables()
        return self.session

    def _create_tables(self):
        """Create the schema (idempotent). This is the single source of truth."""
        cursor = self.sqlite_conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                display_name TEXT,
                nickname TEXT,
                password_hash TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                pending_approval INTEGER DEFAULT 0,
                must_change_password INTEGER DEFAULT 0,
                email_reminders INTEGER DEFAULT 1,
                email_results INTEGER DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        for col in ("email_reminders", "email_results"):
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col} INTEGER DEFAULT 1")
            except Exception:
                pass

        # One row per email actually sent, so nobody gets the same nudge twice
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                user_id TEXT NOT NULL,
                season INTEGER NOT NULL,
                week INTEGER NOT NULL,
                kind TEXT NOT NULL,
                sent_at TEXT,
                PRIMARY KEY (user_id, season, week, kind)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                token TEXT PRIMARY KEY,
                user_id TEXT,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                is_used INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS reset_tokens_email_idx
            ON password_reset_tokens (email)
        """)

        # Small key/value store for admin-tunable settings (e.g. week override)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # Season calendar, mirrored from ESPN's regular-season week list
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS weeks (
                season INTEGER NOT NULL,
                week INTEGER NOT NULL,
                label TEXT,
                start_date TEXT,
                end_date TEXT,
                PRIMARY KEY (season, week)
            )
        """)

        # One row per FBS game. Spread + favorite persist here because ESPN
        # drops the odds from the scoreboard once a game goes final.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS games (
                game_id TEXT PRIMARY KEY,
                season INTEGER NOT NULL,
                week INTEGER NOT NULL,
                name TEXT,
                short_name TEXT,
                kickoff TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pre',
                status_detail TEXT,
                home_team_id TEXT,
                home_name TEXT,
                home_abbr TEXT,
                home_logo TEXT,
                home_color TEXT,
                home_rank INTEGER,
                home_record TEXT,
                home_conf TEXT,
                home_score INTEGER,
                away_team_id TEXT,
                away_name TEXT,
                away_abbr TEXT,
                away_logo TEXT,
                away_color TEXT,
                away_rank INTEGER,
                away_record TEXT,
                away_conf TEXT,
                away_score INTEGER,
                spread REAL,
                favorite_team_id TEXT,
                spread_source TEXT,
                venue TEXT,
                broadcast TEXT,
                last_updated TEXT
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS games_season_week_idx ON games (season, week)
        """)

        # Migrations: columns added after the first release (no-op if present)
        for col, coltype in (("home_record", "TEXT"), ("away_record", "TEXT"), ("home_conf", "TEXT"), ("away_conf", "TEXT")):
            try:
                cursor.execute(f"ALTER TABLE games ADD COLUMN {col} {coltype}")
            except Exception:
                pass

        # One SuperDog pick per user per week; one user per underdog per week
        # (first to lock it in gets it — the GameDay "no duplicate picks" rule).
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS picks (
                pick_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                season INTEGER NOT NULL,
                week INTEGER NOT NULL,
                game_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                locked_spread REAL NOT NULL,
                result TEXT,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE (user_id, season, week),
                UNIQUE (season, week, team_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (game_id) REFERENCES games(game_id)
            )
        """)

        self.sqlite_conn.commit()
        logger.info("SQLite tables created/verified")

    def disconnect(self):
        """Close this thread's database connection."""
        conn = getattr(self._local, 'conn', None)
        if conn:
            conn.close()
            self._local.conn = None
        logger.info("Disconnected from SQLite")

    def get_session(self):
        """Get this thread's connection (new cursors are created per query)."""
        if self.session is None:
            self.connect()
        return self.sqlite_conn


# Global database instance
db = Database()


def get_db():
    """Dependency for FastAPI routes"""
    return db.get_session()


def get_setting(session, key: str, default=None):
    row = session.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row['value'] if row else default


def set_setting(session, key: str, value):
    session.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, None if value is None else str(value)),
    )
    session.commit()
