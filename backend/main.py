from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import db
from app.limiter import limiter
from app.routers import auth, admin, board, picks, standings, public
from app.services.auth_service import get_password_hash
from app.tasks.sync_scheduler import start_scheduler, stop_scheduler, get_scheduler_status
from datetime import datetime
from uuid import uuid4
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LT SuperDogs API...")
    try:
        validate_security_config()
        db.connect()
        create_default_admin()
        start_scheduler()
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

    yield

    logger.info("Shutting down LT SuperDogs API...")
    stop_scheduler()
    db.disconnect()


def validate_security_config():
    """Warn loudly if insecure default settings are detected at startup"""
    placeholder = "your-secret-key-here-change-this-to-something-random-and-secure"
    if settings.jwt_secret_key == placeholder:
        # Anyone with the example file could mint admin tokens — never boot like this.
        raise RuntimeError("JWT_SECRET_KEY is still the example placeholder. "
                           "Set a real one: python -c \"import secrets; print(secrets.token_hex(32))\"")
    if len(settings.jwt_secret_key) < 32:
        logger.warning("=" * 60)
        logger.warning("SECURITY WARNING: JWT_SECRET_KEY is short. Use at least 32 random bytes.")
        logger.warning("=" * 60)
    if settings.admin_password in {"ChangeThisPassword123!", "Testing123!"}:
        logger.warning("SECURITY WARNING: ADMIN_PASSWORD is a known default — change it in .env.")
    if settings.debug:
        logger.warning("SECURITY WARNING: DEBUG mode is enabled. Disable for production (DEBUG=False).")


def create_default_admin():
    """Create the default admin user on first boot"""
    try:
        session = db.get_session()
        if session.execute("SELECT 1 FROM users WHERE lower(email) = lower(?)", (settings.admin_email,)).fetchone():
            logger.info("Admin user already exists")
            return
        now = datetime.utcnow().isoformat()
        session.execute(
            "INSERT INTO users (user_id, email, username, display_name, password_hash, is_admin, is_active, "
            "pending_approval, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 0, 0, ?, ?)",
            (str(uuid4()), settings.admin_email, "Pool Admin", "Pool Admin",
             get_password_hash(settings.admin_password), now, now))
        session.commit()
        logger.info(f"Default admin user created: {settings.admin_email}")
    except Exception as e:
        logger.warning(f"Could not create default admin: {e}", exc_info=True)


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: the configured frontend URL plus its www/apex twin and local dev ports
_fe = settings.frontend_url.rstrip("/")
_allowed_origins = {_fe, "http://localhost:5174", "http://127.0.0.1:5174"}
if "://www." in _fe:
    _allowed_origins.add(_fe.replace("://www.", "://", 1))
else:
    _allowed_origins.add(_fe.replace("://", "://www.", 1))

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(board.router)
app.include_router(picks.router)
app.include_router(standings.router)
app.include_router(public.router)


@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health_check():
    """Liveness + DB readiness. 503 if the database can't be queried."""
    try:
        session = db.get_session()
        session.execute("SELECT 1").fetchone()
        last_sync = session.execute("SELECT MAX(last_updated) FROM games").fetchone()[0]
        sched = get_scheduler_status()
        return {"status": "healthy", "last_sync": last_sync, "scheduler_running": sched["running"]}
    except Exception as e:
        logger.error(f"Health check DB probe failed: {e}")
        return JSONResponse(status_code=503, content={"status": "unhealthy", "db": "unreachable"})
