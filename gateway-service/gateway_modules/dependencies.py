"""
Shared dependencies for gateway routers.

This module contains authentication, database, and utility functions
that are shared across multiple routers to avoid circular imports.
"""

import os
import re
import json
import pathlib
import uuid
import logging
from typing import Optional, Any
from datetime import datetime

import asyncpg
import jwt
from fastapi import Request, Depends, HTTPException, status, FastAPI
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from gateway_modules.observability import get_tracer, set_user_id, instrument_asyncpg_pool

logger = logging.getLogger(__name__)

# Environment variables
DATABASE_URL = os.getenv("DATABASE_URL")
AUTH_SECRET = os.getenv("AUTH_SECRET")
ALLOW_ANON_STUDIES = os.getenv("ALLOW_ANON_STUDIES", "false").lower() in ("1", "true", "yes", "on")

# Mock auth settings for development
MOCK_AUTH_ENABLED = os.getenv("MOCK_AUTH_ENABLED", "false").lower() in ("1", "true", "yes", "on")
MOCK_USER_ID = os.getenv("MOCK_USER_ID", "00000000-0000-0000-0000-000000000001")
MOCK_SESSION_ID = os.getenv("MOCK_SESSION_ID", "00000000-0000-0000-0000-000000000001")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Async DB pool
db_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global db_pool
    if db_pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL not configured")
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
        instrument_asyncpg_pool(db_pool)
    return db_pool


async def run_migrations():
    """Very simple migration runner executing files in migrations/ once."""
    pool = await get_pool()
    # migrations directory is relative to app.py, not this module
    mig_dir = pathlib.Path(__file__).resolve().parent.parent / "migrations"
    if not mig_dir.exists():
        return
    files = sorted([p for p in mig_dir.iterdir() if p.suffix == ".sql"])
    if not files:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS migrations (
              id BIGSERIAL PRIMARY KEY,
              name TEXT UNIQUE NOT NULL,
              applied_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
        for f in files:
            name = f.name
            exists = await conn.fetchval("SELECT 1 FROM migrations WHERE name=$1", name)
            if exists:
                continue
            sql = f.read_text()
            # Execute in a transaction
            tr = conn.transaction()
            await tr.start()
            try:
                await conn.execute(sql)
                await conn.execute("INSERT INTO migrations(name) VALUES($1)", name)
            except Exception:
                await tr.rollback()
                raise
            else:
                await tr.commit()


def decode_token(auth_header: str) -> dict:
    """Decode a NextAuth HS256 JWT from Authorization header."""
    with get_tracer().start_as_current_span("auth.verify"):
        if not auth_header or not auth_header.lower().startswith("bearer "):
            return {}

        token = auth_header.split(" ", 1)[1]

        if not AUTH_SECRET:
            logger.warning("AUTH_SECRET not configured", extra={"domain": "auth"})
            return {}

        try:
            payload = jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
            return payload or {}
        except Exception:
            return {}


# Alias for backwards compat with any code still calling decode_supabase_token
decode_supabase_token = decode_token


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """FastAPI dependency to get the current authenticated user."""
    auth_header = f"Bearer {token}"
    payload = decode_token(auth_header)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Implicitly sync user to the database to ensure foreign keys won't fail
    user_id = payload.get("sub")
    email = payload.get("email")

    if user_id:
        set_user_id(user_id)

    if user_id and email:
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO users (id, email) 
                    VALUES ($1, $2) 
                    ON CONFLICT (id) DO UPDATE SET email = $2
                    """,
                    user_id, email
                )
        except Exception as e:
            # We don't want to block the request if sync fails, but we should log it
            logger.warning(
                "Error in implicit user sync: %s",
                str(e),
                extra={"domain": "auth"},
            )

    return payload


def get_owner_from_request(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Return (user_id, session_id) from Supabase JWT or cookie/header.
    
    In dev, session can be passed via 'x-session-id' header or 'session_id' cookie.
    When MOCK_AUTH_ENABLED=true, always returns mock user_id for easier development.
    
    IMPORTANT: When user_id is present (authenticated user), session_id is set to None
    to prevent mixing authenticated user data with anonymous session data.
    """
    user_id: Optional[str] = None
    session_id: Optional[str] = None

    # Get session_id first (used for mock auth check)
    session_id = request.headers.get("x-session-id") or request.cookies.get("session_id")
    if session_id:
        if session_id.startswith("temp-"):
            session_id = session_id[5:]
        try:
            session_id = str(uuid.UUID(session_id))
        except ValueError:
            session_id = None

    # Check for mock auth mode - if enabled, always use mock user for development
    if MOCK_AUTH_ENABLED:
        return MOCK_USER_ID, MOCK_SESSION_ID

    # Try to decode JWT for user_id
    payload = decode_token(request.headers.get("Authorization", ""))
    if payload:
        user_id = payload.get("sub") or payload.get("user_id")

    # IMPORTANT: When authenticated, ignore session_id to prevent data leakage
    # between anonymous sessions and authenticated users
    if user_id:
        session_id = None

    if user_id:
        set_user_id(user_id)

    return user_id, session_id


async def log_activity(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    activity_type: str,
    subject_id: Optional[str] = None,
    meta: Optional[dict] = None
):
    """Log user activity to the activities table.
    
    Only logs if user_id OR session_id is present.

    Args:
        pool: Database connection pool
        user_id: Authenticated user ID (from JWT)
        session_id: Anonymous session ID
        activity_type: Type of activity (e.g., 'puzzle_solved', 'game_analyzed')
        subject_id: Optional ID of the subject (e.g., puzzle_id, game_id)
        meta: Optional metadata dict
    """
    if not user_id and not session_id:
        return

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO activities (user_id, session_id, type, subject_id, meta)
                VALUES ($1, $2, $3, $4, $5)
                """,
                user_id,
                session_id,
                activity_type,
                subject_id,
                json.dumps(meta) if meta else None
            )
    except Exception as e:
        # Don't fail the request if activity logging fails
        logger.warning(
            "Failed to log activity: %s",
            str(e),
            extra={"domain": "activity"},
        )


def _dedupe_game_rows(rows: list) -> list[dict]:
    """Ensure the games response does not contain duplicate entries."""
    seen: set[tuple] = set()
    unique: list[dict] = []
    for row in rows:
        record = dict(row)
        key = (
            record.get("id"),
            record.get("provider"),
            record.get("source_id"),
            record.get("digest"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique


# ----- CORS and Middleware Setup -----

def generate_localhost_cors_origins(port_start: int = 3000, port_end: int = 3050) -> list[str]:
    """Generate CORS origins for localhost ports in a range."""
    origins = []
    for port in range(port_start, port_end + 1):
        origins.append(f"http://localhost:{port}")
        origins.append(f"http://127.0.0.1:{port}")
    return origins


def is_allowed_origin(origin: str) -> bool:
    """Check if origin is allowed (localhost with port 3000-3050)."""
    if not origin:
        return False
    pattern = r'^http://(localhost|127\.0\.0\.1):(30[0-4][0-9]|3050)$'
    return bool(re.match(pattern, origin))


def get_cors_origins() -> list[str]:
    """Get CORS origins based on environment."""
    _env = os.getenv("ENV", "development").lower()
    default_cors = generate_localhost_cors_origins(3000, 3050)

    if _env == "production":
        # Production: require explicit allowlist, no wildcards
        cors_env = os.getenv("CORS_ALLOW_ORIGINS")
        if not cors_env:
            raise RuntimeError(
                "CORS_ALLOW_ORIGINS must be explicitly set in production. "
                "Example: CORS_ALLOW_ORIGINS=https://yourapp.com,https://api.yourapp.com"
            )
        allow_origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
        if "*" in allow_origins:
            raise RuntimeError(
                "CORS_ALLOW_ORIGINS cannot contain '*' wildcard in production. "
                "Use explicit domain list instead."
            )
        return allow_origins
    else:
        # Development/staging: permissive CORS
        cors_env = os.getenv("CORS_ALLOW_ORIGINS")
        if cors_env:
            return [origin.strip() for origin in cors_env.split(",") if origin.strip()]
        return default_cors


def setup_cors(app: FastAPI):
    """Configure CORS middleware for the application."""
    allow_origins = get_cors_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def setup_exception_handlers(app: FastAPI):
    """Setup global exception handlers."""
    
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        """Return 429 with Retry-After header when rate limit exceeded."""
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again later."},
            headers={"Retry-After": "60"},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Catch all unhandled exceptions to ensure CORS headers are included."""
        import traceback
        logger.error(
            "[UNHANDLED EXCEPTION] %s: %s",
            type(exc).__name__,
            exc,
            extra={"domain": "gateway"},
        )
        logger.error(traceback.format_exc(), extra={"domain": "gateway"})

        # Get origin from request for CORS header
        origin = request.headers.get("origin", "*")

        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
            }
        )
