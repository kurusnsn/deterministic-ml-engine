from fastapi import FastAPI, HTTPException, Request, Depends, status, Query
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse

# Commentary and heuristics imports
from gateway_modules.services.commentary import (
    CommentaryContext,
    build_commentary_context,
)
from gateway_modules.services.heuristic_narrator import (
    render_non_llm_commentary,
    render_commentary_from_context,
)
from gateway_modules.services.heuristics_service import calculate_position_heuristics
import asyncio
import json
from typing import AsyncGenerator
from fastapi.security import OAuth2PasswordBearer
import httpx
import os
from dotenv import load_dotenv
import asyncpg
import jwt
import hashlib
import uuid
from typing import Optional, Any, List, Dict
from datetime import datetime
import pathlib
import time
import chess
from pydantic import BaseModel
import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

from gateway_modules.observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
    instrument_asyncpg_pool,
    get_tracer,
    record_external_api_duration,
    increment_analysis_requests,
    increment_gpu_jobs,
    record_llm_tokens,
    record_gpu_queue_wait,
    set_gpu_slots_in_use,
)
from opentelemetry.propagate import extract
from opentelemetry import trace as otel_trace

init_observability("gateway")

logger = logging.getLogger(__name__)

# Initialize Sentry
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
    )

# SECURITY COMPUTE-1/2: Rate limiting
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse
from gateway_modules.rate_limiter import (
    limiter,
    get_stockfish_limit,
    get_llm_limit,
    check_daily_limit,
    increment_daily_usage,
)

# GPU routing with paid user threshold
from gateway_modules.gpu_routing import (
    should_use_modal_gpu,
    register_paid_session,
    update_gpu_status,
    is_gpu_likely_cold,
)

# SECURITY: CAPTCHA verification for signup/login
from gateway_modules.services.captcha_service import verify_turnstile_token
TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY")

app = FastAPI()
instrument_fastapi(app)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    # Extract W3C Trace Context from incoming headers (traceparent)
    carrier = {k.lower(): v for k, v in request.headers.items()}
    ctx = extract(carrier)

    request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
    route = f"{request.method} {request.url.path}"
    set_request_context(route, request_id, "gateway")

    # Start span with extracted context for distributed tracing
    tracer = get_tracer()
    with tracer.start_as_current_span(
        f"{request.method} {request.url.path}",
        context=ctx,
        kind=otel_trace.SpanKind.SERVER,
    ) as span:
        start = time.perf_counter()
        response = None
        try:
            response = await call_next(request)

            # Add trace ID to response headers for debugging
            span_ctx = span.get_span_context()
            if span_ctx and span_ctx.trace_id:
                trace_id = format(span_ctx.trace_id, "032x")
                response.headers["x-trace-id"] = trace_id

            return response
        finally:
            route_obj = request.scope.get("route")
            route_path = getattr(route_obj, "path", request.url.path)
            route = f"{request.method} {route_path}"
            set_request_context(route, request_id, "gateway")
            duration_ms = (time.perf_counter() - start) * 1000
            status_code = response.status_code if response else 500
            record_http_metrics(route, request.method, status_code, duration_ms)
            clear_request_context()

# Add rate limiter state and exception handler
app.state.limiter = limiter

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

# GPU state tracking moved to gateway_modules.gpu_routing
# is_gpu_likely_cold(), update_gpu_status(), should_use_modal_gpu() imported above

DATABASE_URL = os.getenv("DATABASE_URL")
AUTH_SECRET = os.getenv("AUTH_SECRET")
ALLOW_ANON_STUDIES = os.getenv("ALLOW_ANON_STUDIES", "false").lower() in ("1", "true", "yes", "on")

# Mock auth settings for development
MOCK_AUTH_ENABLED = os.getenv("MOCK_AUTH_ENABLED", "false").lower() in ("1", "true", "yes", "on")
# Use a proper UUID for mock user so it can be stored in the users table
MOCK_USER_ID = os.getenv("MOCK_USER_ID", "00000000-0000-0000-0000-000000000001")
MOCK_SESSION_ID = os.getenv("MOCK_SESSION_ID", "00000000-0000-0000-0000-000000000001")
MOCK_USER_EMAIL = os.getenv("MOCK_USER_EMAIL", "mock@localhost.dev")
MOCK_SUBSCRIPTION_PLAN = os.getenv("MOCK_SUBSCRIPTION_PLAN", "plus").lower()
MOCK_SUBSCRIPTION_BILLING_CYCLE = os.getenv("MOCK_SUBSCRIPTION_BILLING_CYCLE", "monthly").lower()


def get_mock_subscription_settings() -> tuple[str, Optional[str], Optional[str]]:
    if MOCK_SUBSCRIPTION_PLAN in ("basic", "plus"):
        billing = MOCK_SUBSCRIPTION_BILLING_CYCLE if MOCK_SUBSCRIPTION_BILLING_CYCLE in ("monthly", "annual") else "monthly"
        return "active", MOCK_SUBSCRIPTION_PLAN, billing

    if MOCK_SUBSCRIPTION_PLAN == "trialing":
        billing = MOCK_SUBSCRIPTION_BILLING_CYCLE if MOCK_SUBSCRIPTION_BILLING_CYCLE in ("monthly", "annual") else "monthly"
        return "trialing", "plus", billing

    return "free", None, None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


import re

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

# SECURITY INFRA-1: CORS configuration with production lockdown
# Default CORS origins for localhost development (ports 3000-3050)
default_cors = generate_localhost_cors_origins(3000, 3050)

# Determine environment
_env = os.getenv("ENV", "development").lower()

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
else:
    # Development/staging: permissive CORS
    cors_env = os.getenv("CORS_ALLOW_ORIGINS")
    if cors_env:
        allow_origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
    else:
        allow_origins = default_cors

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression for large responses (especially reports which can be 2-5MB)
# This compresses JSON responses to ~10-20% of original size
app.add_middleware(GZipMiddleware, minimum_size=500)

STOCKFISH_URL = os.getenv("STOCKFISH_URL", "http://stockfish:5000")
ECO_URL = os.getenv("ECO_URL", "http://eco:8000")


async def is_book_position(fen: str, client: httpx.AsyncClient) -> bool:
    """
    Check if a position (FEN) is in the ECO opening database.
    Returns True if the position is found in the opening database.
    """
    try:
        eco_resp = await client.post(f"{ECO_URL}/eco", json={"fen": fen}, timeout=5.0)
        if eco_resp.status_code == 200:
            eco_data = eco_resp.json()
            return eco_data.get("found", False)
    except Exception:
        # If ECO service fails, assume not a book position
        pass
    return False


async def apply_move_to_fen(fen: str, uci_move: str) -> Optional[str]:
    """
    Apply a UCI move to a FEN position and return the resulting FEN.
    Returns None if the move is invalid.
    """
    try:
        board = chess.Board(fen)
        move = chess.Move.from_uci(uci_move)
        if move in board.legal_moves:
            board.push(move)
            return board.fen()
    except Exception:
        pass
    return None


async def update_book_move_classifications(
    stockfish_result: dict,
    current_fen: str,
    client: httpx.AsyncClient,
    max_move_number: int = 15
) -> dict:
    """
    Update move classifications to mark book moves.
    A move is a book move if:
    1. The position after the move is in the ECO database
    2. It's not already brilliant or great
    3. We're still in the opening phase (move_number <= max_move_number)
    
    Returns updated stockfish_result with book move classifications.
    """
    # Extract move number from FEN (fullmove number is the last field)
    try:
        move_number = int(current_fen.split()[-1]) if current_fen.split()[-1].isdigit() else 1
    except Exception:
        move_number = 1
    
    # Only check for book moves in the opening phase
    if move_number > max_move_number:
        return stockfish_result

    # Check if we have analysis results
    if "error" in stockfish_result or "analysis" not in stockfish_result:
        return stockfish_result

    analysis = stockfish_result["analysis"]

    # Check ALL moves to see if they lead to a book position
    for move_analysis in analysis:
        classification = move_analysis.get("classification", "")

        # Skip if already has a meaningful classification that should take precedence
        if classification in ["brilliant", "great", "blunder", "mistake", "miss", "inaccuracy"]:
            continue

        # Get the UCI move
        uci_move = move_analysis.get("uci")
        if not uci_move:
            continue

        # Apply the move to get the resulting FEN
        resulting_fen = await apply_move_to_fen(current_fen, uci_move)
        if not resulting_fen:
            continue

        # Check if the resulting position is in the ECO database
        is_book = await is_book_position(resulting_fen, client)

        if is_book:
            # Mark as book move (only if not already brilliant/great and not a bad move)
            move_analysis["classification"] = "book"
    
    return stockfish_result

OPENINGBOOK_URL = os.getenv("OPENINGBOOK_URL", "http://openingbook:8001")
IMPORT_URL = os.getenv("IMPORT_URL", "http://import:8000")
PAYMENT_URL = os.getenv("PAYMENT_URL", "http://payment:8000")
PUZZLE_URL = os.getenv("PUZZLE_URL", "http://puzzle:8081")

LLM_URL = os.getenv("LLM_URL")

# Import centralized settings for 3-tier architecture
from gateway_modules.settings import (
    ENABLE_LC0_ANALYSIS,
    ENABLE_LLM_COMMENTARY,
    USE_LOCAL_HEURISTICS,
    USE_UNIFIED_INFERENCE,
    LC0_SERVICE_URL,
    LLM_SERVICE_URL,
    UNIFIED_INFERENCE_URL,
)
DATABASE_URL = os.getenv("DATABASE_URL")

# Async DB pool
db_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
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
    mig_dir = pathlib.Path(__file__).resolve().parent / "migrations"
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


def decode_supabase_token(auth_header: str) -> dict:
    """Decode NextAuth HS256 JWT from Authorization header."""
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return {}

    token = auth_header.split(" ", 1)[1]
    secret = AUTH_SECRET
    if not secret:
        return {}

    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload or {}
    except Exception:
        return {}


async def get_current_user(token: str = Depends(oauth2_scheme)):
    # Use our robust decoding logic that supports both ES256 (JWKS) and HS256
    auth_header = f"Bearer {token}"
    payload = decode_supabase_token(auth_header)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Implicitly sync user to the database to ensure foreign keys won't fail
    user_id = payload.get("sub")
    email = payload.get("email")
    
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
            logger.info(f"Error in implicit user sync: {str(e)}")
            
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
    payload = decode_supabase_token(request.headers.get("Authorization", ""))
    if payload:
        user_id = payload.get("sub") or payload.get("user_id")

    # IMPORTANT: When authenticated, ignore session_id to prevent data leakage
    # between anonymous sessions and authenticated users
    if user_id:
        session_id = None

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
        logger.info(f"Failed to log activity: {e}")


def _dedupe_game_rows(rows: list[asyncpg.Record | dict]) -> list[dict]:
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


@app.on_event("startup")
async def on_startup():
    # SECURITY AUTH-2: Refuse to start if mock auth enabled in production
    env = os.getenv("ENV", "development").lower()
    if env == "production" and MOCK_AUTH_ENABLED:
        raise RuntimeError(
            "CRITICAL: MOCK_AUTH_ENABLED=true is not allowed in production. "
            "This would bypass all authentication. Refusing to start."
        )
    
    # SECURITY: CAPTCHA secret required in production
    if env == "production" and not TURNSTILE_SECRET_KEY:
        raise RuntimeError(
            "CRITICAL: TURNSTILE_SECRET_KEY is required in production. "
            "CAPTCHA verification will fail without it. Refusing to start."
        )
    
    await start_event_loop_lag_monitor()

    # Ensure pool and migrations are ready
    if DATABASE_URL:
        pool = await get_pool()
        await run_migrations()
        # Ensure mock user exists in database when mock auth is enabled
        if MOCK_AUTH_ENABLED:
            mock_status, mock_plan, mock_billing_cycle = get_mock_subscription_settings()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO users (
                        id, email, subscription_status, subscription_plan,
                        subscription_billing_cycle, trial_expires_at, created_at
                    )
                    VALUES (
                        $1, $2, $3, $4, $5,
                        CASE WHEN $3 = 'trialing' THEN NOW() + INTERVAL '14 days' ELSE NULL END,
                        NOW()
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        email = EXCLUDED.email,
                        subscription_status = EXCLUDED.subscription_status,
                        subscription_plan = EXCLUDED.subscription_plan,
                        subscription_billing_cycle = EXCLUDED.subscription_billing_cycle,
                        trial_expires_at = EXCLUDED.trial_expires_at
                    """,
                    MOCK_USER_ID,
                    MOCK_USER_EMAIL,
                    mock_status,
                    mock_plan,
                    mock_billing_cycle,
                )


@app.post("/opening-book")
async def opening_book(payload: dict):
    """
    Forward SAN moves to opening-book-service for WikiBook lookup
    Expected payload: { "moves": ["e4","e5","Nf3"] }
    """
    logger.info(f"Gateway: OPENINGBOOK_URL environment variable: {OPENINGBOOK_URL}")
    logger.info(f"Gateway: Opening book request with payload: {payload}")

    # Test which service is actually responding
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # First check the health endpoint to see which service responds
            health_url = f"{OPENINGBOOK_URL}/health"
            logger.info(f"Gateway: Testing health endpoint: {health_url}")
            try:
                health_resp = await client.get(health_url)
                health_data = health_resp.json()
                logger.info(f"Gateway: Health check response: {health_data}")
            except Exception as e:
                logger.info(f"Gateway: Health check failed: {e}")

            # Try the main health endpoint too
            try:
                alt_health_resp = await client.get(f"{OPENINGBOOK_URL}/opening/health")
                alt_health_data = alt_health_resp.json()
                logger.info(f"Gateway: Alt health check response: {alt_health_data}")
            except Exception as e:
                logger.info(f"Gateway: Alt health check failed: {e}")

            # Now make the actual request
            theory_url = f"{OPENINGBOOK_URL}/opening/theory"
            logger.info(f"Gateway: Calling {theory_url}")
            r = await client.post(theory_url, json=payload)
            logger.info(f"Gateway: Opening book response status: {r.status_code}")
            logger.info(f"Gateway: Opening book response headers: {dict(r.headers)}")
            result = r.json()
            logger.info(f"Gateway: Opening book response data: {result}")
            return result
        except Exception as e:
            logger.info(f"Gateway: Opening book service error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"OpeningBook service error: {str(e)}")

# Studies endpoints moved to gateway_modules/routers/studies.py

@app.get("/opening/book")
async def opening_book_proxy(request: Request):
    """
    Proxy GET /opening/book to opening-book-service, preserving query params.
    Useful for Lichess Explorer-like aggregate lookups per FEN.
    """
    query = request.url.query
    target = f"{OPENINGBOOK_URL}/opening/book"
    if query:
        target = f"{target}?{query}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(target)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"OpeningBook HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpeningBook proxy error: {e}")


@app.post("/opening/popularity/by-fens")
async def opening_popularity_proxy(request: Request):
    """
    Proxy POST /opening/popularity/by-fens to opening-book-service.
    Returns game counts for a list of FEN positions.
    """
    target = f"{OPENINGBOOK_URL}/opening/popularity/by-fens"
    body = await request.json()
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(target, json=body)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Popularity service error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Popularity proxy error: {e}")


@app.post("/api/openings/master/line")
async def master_opening_line(request: Request, body: dict, pool: asyncpg.Pool = Depends(get_pool)):
    """
    Mark an opening line as mastered for the current user/session.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    opening_id = body.get("opening_id")
    line_id = body.get("line_id")
    
    if not opening_id or not line_id:
        raise HTTPException(status_code=400, detail="Missing opening_id or line_id")
    
    try:
        async with pool.acquire() as conn:
            # Check if already mastered
            if user_id:
                exists = await conn.fetchval(
                    "SELECT 1 FROM mastered_opening_lines WHERE user_id = $1 AND opening_id = $2 AND line_id = $3",
                    user_id, opening_id, line_id
                )
            else:
                exists = await conn.fetchval(
                    "SELECT 1 FROM mastered_opening_lines WHERE session_id = $1 AND user_id IS NULL AND opening_id = $2 AND line_id = $3",
                    session_id, opening_id, line_id
                )
                
            if not exists:
                await conn.execute(
                    """
                    INSERT INTO mastered_opening_lines (user_id, session_id, opening_id, line_id)
                    VALUES ($1, $2, $3, $4)
                    """,
                    user_id, session_id, opening_id, line_id
                )
                
                # Log activity for heatmap
                await log_activity(pool, user_id, session_id, "opening_line_mastered", opening_id, {"line_id": line_id})
            
        return {"status": "ok"}
    except Exception as e:
        logger.info(f"Error mastering opening line: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to master line: {e}")


@app.get("/api/openings/mastered/stats")
async def get_mastered_openings_stats(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    """
    Get statistics about mastered opening lines.
    Returns mapping of opening_id -> count of mastered lines.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
        
    try:
        async with pool.acquire() as conn:
            # Query based on owned context
            if user_id:
                rows = await conn.fetch(
                    """
                    SELECT opening_id, COUNT(line_id) as count
                    FROM mastered_opening_lines
                    WHERE user_id = $1
                    GROUP BY opening_id
                    """,
                    user_id
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT opening_id, COUNT(line_id) as count
                    FROM mastered_opening_lines
                    WHERE session_id = $1 AND user_id IS NULL
                    GROUP BY opening_id
                    """,
                    session_id
                )
            
            stats = {row["opening_id"]: row["count"] for row in rows}
            total = sum(stats.values())
            
            return {"openings": stats, "total": total}
    except Exception as e:
        logger.info(f"Error fetching mastered openings stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {e}")



@app.get("/opening/book/internal")
async def opening_book_internal(fen: str, pool: asyncpg.Pool = Depends(get_pool)):

    """
    Query internal games database for opening statistics.
    Returns moves played from this position with win/loss/draw counts.
    
    Schema:
    - moves: game_id, ply, san, uci, fen_before, fen_after
    - games: id, result, user_id
    
    Response format matches Lichess API for frontend compatibility:
    {
        "moves": [
            {"san": "e4", "uci": "e2e4", "white": 100, "black": 80, "draws": 50}
        ]
    }
    """
    try:
        import io
        import chess.pgn
        from collections import defaultdict

        def fen_key(value: str) -> str:
            parts = (value or "").strip().split()
            return " ".join(parts[:4]) if len(parts) >= 4 else (value or "").strip()

        normalized_fen = fen_key(fen)
        pgn_fallback_limit = int(os.getenv("INTERNAL_BOOK_PGN_FALLBACK_LIMIT", "1000"))

        # Fast path: use precomputed moves table when available.
        query = """
            WITH position_moves AS (
                SELECT
                    m.san,
                    m.uci,
                    g.result
                FROM moves m
                JOIN games g ON m.game_id = g.id
                WHERE split_part(m.fen_before, ' ', 1) || ' ' ||
                      split_part(m.fen_before, ' ', 2) || ' ' ||
                      split_part(m.fen_before, ' ', 3) || ' ' ||
                      split_part(m.fen_before, ' ', 4) = $1
            )
            SELECT
                san,
                MIN(uci) as uci,
                COUNT(*) FILTER (WHERE result = '1-0') as white,
                COUNT(*) FILTER (WHERE result = '0-1') as black,
                COUNT(*) FILTER (WHERE result = '1/2-1/2' OR result = '½-½') as draws,
                COUNT(*) as total
            FROM position_moves
            GROUP BY san
            ORDER BY total DESC
            LIMIT 20
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, normalized_fen)

        if rows:
            return {
                "moves": [
                    {
                        "san": row["san"],
                        "uci": row["uci"] or "",
                        "white": row["white"] or 0,
                        "black": row["black"] or 0,
                        "draws": row["draws"] or 0,
                    }
                    for row in rows
                ]
            }

        # Fallback for environments where games exist but moves table is not backfilled.
        async with pool.acquire() as conn:
            game_rows = await conn.fetch(
                """
                SELECT pgn, result
                FROM games
                WHERE pgn IS NOT NULL AND pgn <> ''
                ORDER BY COALESCE(played_at, created_at) DESC
                LIMIT $1
                """,
                pgn_fallback_limit,
            )

        aggregate = defaultdict(lambda: {"san": "", "uci": "", "white": 0, "black": 0, "draws": 0})

        for game_row in game_rows:
            pgn_text = game_row["pgn"]
            if not pgn_text:
                continue
            try:
                parsed_game = chess.pgn.read_game(io.StringIO(pgn_text))
            except Exception:
                continue
            if parsed_game is None:
                continue

            result = (parsed_game.headers.get("Result") or game_row["result"] or "").strip()
            board = parsed_game.board()
            for move in parsed_game.mainline_moves():
                before_key = fen_key(board.fen())
                san = board.san(move)
                uci = move.uci()
                board.push(move)
                if before_key != normalized_fen:
                    continue

                key = (san, uci)
                item = aggregate[key]
                item["san"] = san
                item["uci"] = uci
                if result == "1-0":
                    item["white"] += 1
                elif result == "0-1":
                    item["black"] += 1
                elif result in {"1/2-1/2", "½-½"}:
                    item["draws"] += 1

        moves = sorted(
            aggregate.values(),
            key=lambda item: item["white"] + item["black"] + item["draws"],
            reverse=True,
        )[:20]

        return {"moves": moves}

    except Exception as e:
        logger.info(f"[Opening Book Internal] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database query error: {e}")

def summarize_stockfish(analysis):
    """
    Turn Stockfish analysis JSON into a short readable summary of recommended moves.
    """
    lines = []

    lines.append("Top engine recommendations for the current position:")

    for m in analysis[:3]:  # only top 3 moves
        flags = [k for k, v in m.get("flags", {}).items() if v]
        features = m.get("features", {})
        tactical = m.get("tactical_context", {})
        attacks = m.get("attacks", {})
        attacked_pieces = m.get("attacked_pieces", {})

        line = (
            f"Move {m['move']} (uci: {m['uci']}): "
            f"Eval {m['score']} ({m['classification']}); "
            f"Depth {m.get('depth', '?')}, Nodes {m.get('nodes', '?')}\n"
            f"Features -> Mobility {features.get('mobility', '?')}, "
            f"Center {features.get('center_control', '?')}, "
            f"King safety {features.get('king_safety', '?')}, "
            f"Material {features.get('material_balance', '?')}\n"
            f"Tactical -> Safety: {tactical.get('safety', '?')}, "
            f"White attackers: {', '.join(tactical.get('attackers_white', []))}, "
            f"Black attackers: {', '.join(tactical.get('attackers_black', []))}\n"
            f"Squares attacked -> White: {', '.join(attacks.get('white', []))}, "
            f"Black: {', '.join(attacks.get('black', []))}\n"
            f"Pieces under attack -> White: {', '.join(attacked_pieces.get('white', []))}, "
            f"Black: {', '.join(attacked_pieces.get('black', []))}\n"
            f"Flags: {', '.join(flags) if flags else 'none'}"
        )
        lines.append(line)
    return "\n\n".join(lines)


def parse_fen_to_board_description(fen: str) -> str:
    """
    Parse FEN string into human-readable board description.
    This prevents LLM from hallucinating about non-existent pieces.
    """
    import chess

    try:
        board = chess.Board(fen)

        # Collect pieces by color
        white_pieces = {
            'pawns': [],
            'knights': [],
            'bishops': [],
            'rooks': [],
            'queens': [],
            'king': None
        }

        black_pieces = {
            'pawns': [],
            'knights': [],
            'bishops': [],
            'rooks': [],
            'queens': [],
            'king': None
        }

        # Map piece types to readable names
        piece_map = {
            chess.PAWN: 'pawns',
            chess.KNIGHT: 'knights',
            chess.BISHOP: 'bishops',
            chess.ROOK: 'rooks',
            chess.QUEEN: 'queens',
            chess.KING: 'king'
        }

        # Iterate through all squares
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece:
                square_name = chess.square_name(square)
                piece_type_name = piece_map[piece.piece_type]

                if piece.color == chess.WHITE:
                    if piece_type_name == 'king':
                        white_pieces['king'] = square_name
                    else:
                        white_pieces[piece_type_name].append(square_name)
                else:
                    if piece_type_name == 'king':
                        black_pieces['king'] = square_name
                    else:
                        black_pieces[piece_type_name].append(square_name)

        # Build description
        lines = []
        lines.append("EXACT BOARD STATE (use this, not opening theory):")

        # White pieces
        white_desc = []
        if white_pieces['pawns']:
            white_desc.append(f"pawns on {', '.join(sorted(white_pieces['pawns']))}")
        if white_pieces['knights']:
            white_desc.append(f"knights on {', '.join(sorted(white_pieces['knights']))}")
        if white_pieces['bishops']:
            white_desc.append(f"bishops on {', '.join(sorted(white_pieces['bishops']))}")
        if white_pieces['rooks']:
            white_desc.append(f"rooks on {', '.join(sorted(white_pieces['rooks']))}")
        if white_pieces['queens']:
            white_desc.append(f"queens on {', '.join(sorted(white_pieces['queens']))}")
        if white_pieces['king']:
            white_desc.append(f"king on {white_pieces['king']}")

        lines.append(f"White has: {'; '.join(white_desc)}")

        # Black pieces
        black_desc = []
        if black_pieces['pawns']:
            black_desc.append(f"pawns on {', '.join(sorted(black_pieces['pawns']))}")
        if black_pieces['knights']:
            black_desc.append(f"knights on {', '.join(sorted(black_pieces['knights']))}")
        if black_pieces['bishops']:
            black_desc.append(f"bishops on {', '.join(sorted(black_pieces['bishops']))}")
        if black_pieces['rooks']:
            black_desc.append(f"rooks on {', '.join(sorted(black_pieces['rooks']))}")
        if black_pieces['queens']:
            black_desc.append(f"queens on {', '.join(sorted(black_pieces['queens']))}")
        if black_pieces['king']:
            black_desc.append(f"king on {black_pieces['king']}")

        lines.append(f"Black has: {'; '.join(black_desc)}")

        # Critical note to prevent hallucination
        lines.append("\nCRITICAL: This is the COMPLETE and EXACT board state.")
        lines.append("- Every piece on the board is listed above")
        lines.append("- If a square is NOT listed, it is EMPTY (no piece there)")
        lines.append("- Do NOT assume pieces exist based on opening theory")
        lines.append("- Analyze ONLY what is explicitly stated above")

        return "\n".join(lines)

    except Exception as e:
        return f"Could not parse FEN: {e}"


def describe_board_state(fen: str) -> str:
    """
    Historical alias retained for compatibility with streaming endpoints.
    """
    return parse_fen_to_board_description(fen)


def compute_move_facts(fen_before: str, fen_after: str, move_from: str, move_to: str, move_san: str) -> dict:
    """
    Compute factual information about a chess move that can be narrated by the LLM.
    This prevents LLM from hallucinating chess consequences.
    """
    import chess

    try:
        board_before = chess.Board(fen_before)
        board_after = chess.Board(fen_after)

        from_square = chess.parse_square(move_from)
        to_square = chess.parse_square(move_to)

        # Get the piece that moved
        piece = board_after.piece_at(to_square)
        if not piece:
            return {"error": "No piece found at destination"}

        piece_names = {
            chess.PAWN: "pawn",
            chess.KNIGHT: "knight",
            chess.BISHOP: "bishop",
            chess.ROOK: "rook",
            chess.QUEEN: "queen",
            chess.KING: "king"
        }
        piece_type = piece_names.get(piece.piece_type, "piece")
        piece_color = "White" if piece.color == chess.WHITE else "Black"

        facts = {
            "piece_type": piece_type,
            "piece_color": piece_color,
            "from_square": move_from,
            "to_square": move_to,
            "move_san": move_san,
        }

        # Squares controlled by the moved piece in new position
        controlled_squares = []
        for square in chess.SQUARES:
            if board_after.is_attacked_by(piece.color, square):
                # Check if this specific piece attacks this square
                attackers = board_after.attackers(piece.color, square)
                if to_square in attackers:
                    controlled_squares.append(chess.square_name(square))
        facts["squares_controlled"] = sorted(controlled_squares)

        # Pieces NEWLY defended by the moved piece that are UNDER ATTACK
        # Only report meaningful defenses - pieces the opponent is actually attacking
        defended_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color == piece.color and square != to_square:
                # Check if this piece now defends this square
                attackers_after = board_after.attackers(piece.color, square)
                if to_square in attackers_after:
                    # Check if it was already defended by this piece before the move
                    attackers_before = board_before.attackers(piece.color, square)
                    was_defended_by_this_piece = from_square in attackers_before

                    if not was_defended_by_this_piece:
                        # Only report if the piece is actually under attack by opponent
                        is_under_attack = board_after.is_attacked_by(not piece.color, square)
                        if is_under_attack:
                            sq_name = chess.square_name(square)
                            defended_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
        facts["pieces_defended"] = defended_pieces

        # Pieces NEWLY attacked by the moved piece (enemy pieces it now threatens)
        attacked_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color != piece.color:
                attackers_after = board_after.attackers(piece.color, square)
                if to_square in attackers_after:
                    # Check if it was already attacked by this piece before
                    attackers_before = board_before.attackers(piece.color, square)
                    was_attacked_by_this_piece = from_square in attackers_before

                    if not was_attacked_by_this_piece:
                        attacked_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {chess.square_name(square)}")
        facts["pieces_attacked"] = attacked_pieces

        # Hanging pieces - friendly pieces under attack without adequate defense
        # This catches missed threats and blunders
        hanging_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color == piece.color:
                # Skip the king (can't be "hanging" in normal sense)
                if target_piece.piece_type == chess.KING:
                    continue

                # Check if under attack by opponent
                opponent_attackers = board_after.attackers(not piece.color, square)
                if opponent_attackers:
                    # Count defenders (friendly pieces defending this square)
                    defenders = board_after.attackers(piece.color, square)

                    num_attackers = len(opponent_attackers)
                    num_defenders = len(defenders)

                    # Piece is hanging if attackers > defenders
                    # Also consider piece values for trades
                    if num_attackers > num_defenders:
                        sq_name = chess.square_name(square)
                        hanging_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
                    elif num_attackers == num_defenders and num_attackers > 0:
                        # Equal attackers/defenders - check if trade is bad
                        # Get the lowest value attacker
                        piece_values = {
                            chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                            chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0
                        }
                        target_value = piece_values.get(target_piece.piece_type, 0)

                        # Find lowest value attacker
                        min_attacker_value = 10
                        for attacker_sq in opponent_attackers:
                            attacker = board_after.piece_at(attacker_sq)
                            if attacker:
                                attacker_value = piece_values.get(attacker.piece_type, 0)
                                min_attacker_value = min(min_attacker_value, attacker_value)

                        # If lowest attacker is worth less than target, it's a bad trade
                        if min_attacker_value < target_value:
                            sq_name = chess.square_name(square)
                            hanging_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")

        facts["hanging_pieces"] = hanging_pieces

        # Check for lines/diagonals opened (for pawns and other pieces)
        lines_opened = []

        # Check if a bishop's diagonal was opened
        # For pawns: check if moving opened diagonal for bishop
        if piece.piece_type == chess.PAWN:
            # Check both bishops
            for bishop_square in board_after.pieces(chess.BISHOP, piece.color):
                bishop_sq_name = chess.square_name(bishop_square)
                bishop_piece = board_after.piece_at(bishop_square)

                # Determine bishop color (light or dark squared)
                is_light_square = (chess.square_file(bishop_square) + chess.square_rank(bishop_square)) % 2 == 1
                bishop_type = "light-squared" if is_light_square else "dark-squared"

                # Count squares bishop attacks before and after
                attacks_before = len(list(board_before.attacks(bishop_square)))
                attacks_after = len(list(board_after.attacks(bishop_square)))

                if attacks_after > attacks_before:
                    lines_opened.append(f"{bishop_type} bishop on {bishop_sq_name}")

        # Check if rook files were opened
        if piece.piece_type == chess.PAWN:
            for rook_square in board_after.pieces(chess.ROOK, piece.color):
                rook_sq_name = chess.square_name(rook_square)
                attacks_before = len(list(board_before.attacks(rook_square)))
                attacks_after = len(list(board_after.attacks(rook_square)))

                # Only meaningful if no friendly pawns remain on the rook's file —
                # a pawn push that just steps away still blocks the rook one square later.
                rook_file = chess.square_file(rook_square)
                pawns_still_on_file = any(
                    chess.square_file(sq) == rook_file
                    for sq in board_after.pieces(chess.PAWN, piece.color)
                )
                if attacks_after > attacks_before and not pawns_still_on_file:
                    lines_opened.append(f"rook on {rook_sq_name}")

        # Also check queen
        if piece.piece_type == chess.PAWN:
            for queen_square in board_after.pieces(chess.QUEEN, piece.color):
                queen_sq_name = chess.square_name(queen_square)
                attacks_before = len(list(board_before.attacks(queen_square)))
                attacks_after = len(list(board_after.attacks(queen_square)))

                if attacks_after > attacks_before:
                    lines_opened.append(f"queen on {queen_sq_name}")

        facts["lines_opened"] = lines_opened

        # Check if rooks are connected (no pieces between them on same rank)
        rooks = list(board_after.pieces(chess.ROOK, piece.color))
        rooks_connected = False
        if len(rooks) == 2:
            rook1, rook2 = rooks
            # Check if on same rank
            if chess.square_rank(rook1) == chess.square_rank(rook2):
                rank = chess.square_rank(rook1)
                file1, file2 = chess.square_file(rook1), chess.square_file(rook2)
                min_file, max_file = min(file1, file2), max(file1, file2)

                # Check for pieces between them
                blocked = False
                for f in range(min_file + 1, max_file):
                    sq = chess.square(f, rank)
                    if board_after.piece_at(sq):
                        blocked = True
                        break
                rooks_connected = not blocked
            # Check if on same file
            elif chess.square_file(rook1) == chess.square_file(rook2):
                file = chess.square_file(rook1)
                rank1, rank2 = chess.square_rank(rook1), chess.square_rank(rook2)
                min_rank, max_rank = min(rank1, rank2), max(rank1, rank2)

                blocked = False
                for r in range(min_rank + 1, max_rank):
                    sq = chess.square(file, r)
                    if board_after.piece_at(sq):
                        blocked = True
                        break
                rooks_connected = not blocked

        facts["rooks_connected"] = rooks_connected

        # Check for special move properties
        # Reconstruct the move to check flags
        try:
            move = chess.Move(from_square, to_square)
            facts["is_check"] = board_after.is_check()
            facts["is_capture"] = board_before.piece_at(to_square) is not None
            facts["is_castling"] = board_before.is_castling(move)

            # Check captured piece
            captured = board_before.piece_at(to_square)
            if captured:
                facts["captured_piece"] = piece_names.get(captured.piece_type, "piece")
            else:
                facts["captured_piece"] = None

        except:
            facts["is_check"] = False
            facts["is_capture"] = False
            facts["is_castling"] = False
            facts["captured_piece"] = None

        # Castling rights
        facts["can_castle_kingside"] = board_after.has_kingside_castling_rights(piece.color)
        facts["can_castle_queenside"] = board_after.has_queenside_castling_rights(piece.color)

        # Central control (d4, d5, e4, e5)
        central_squares = [chess.D4, chess.D5, chess.E4, chess.E5]
        central_controlled = []
        for sq in central_squares:
            if to_square in board_after.attackers(piece.color, sq):
                central_controlled.append(chess.square_name(sq))
        facts["central_squares_controlled"] = central_controlled

        return facts

    except Exception as e:
        return {"error": str(e)}

# Health endpoints moved to gateway_modules/routers/health.py

# Diagnostics endpoints moved to gateway_modules/routers/health.py
# Puzzle proxy endpoints moved to gateway_modules/routers/puzzles.py

# Games endpoints moved to gateway_modules/routers/games.py
# Imports endpoints moved to gateway_modules/routers/imports.py

# Users endpoints (link-session, usernames) moved to gateway_modules/routers/users.py
# ECO proxy endpoints moved to gateway_modules/routers/openings.py
# Import proxy endpoints moved to gateway_modules/routers/imports.py


@app.post("/payments/create-checkout-session")
async def payments_create_checkout_session(request: Request):
    if not PAYMENT_URL:
        raise HTTPException(status_code=500, detail="PAYMENT_URL not configured")
    try:
        body = await request.json()
        headers = {"Content-Type": "application/json"}
        # forward auth header if present
        auth = request.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{PAYMENT_URL}/create-checkout-session", json=body, headers=headers)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment proxy error: {e}")


@app.post("/llm/chat")
async def chat_with_llm(payload: dict):
    """
    Send chess-related queries to LLM service
    Expected payload: {
        "messages": [...],
        "fen": "optional_fen_string", 
        "pv": ["optional", "pv", "moves"],
        "context": "optional_chess_context"
    }
    """
    logger.info(f"Debug - LLM_URL: {LLM_URL}")
    logger.info(f"Debug - Payload received: {payload}")
    
    if not LLM_URL:
        raise HTTPException(status_code=500, detail="LLM_URL not configured")
    
    try:
        llm_payload = {
            "model": "llm",  # Modal GPT-OSS 20B served model name
            "messages": payload.get("messages", []),
            "max_tokens": payload.get("max_tokens", 500),
            "temperature": payload.get("temperature", 0.7),
            "stream": False
        }
        
        if payload.get("fen") or payload.get("pv") or payload.get("context"):
            chess_context = []
            
            if payload.get("move_history"):
                moves_played = payload['move_history']
                if moves_played:
                    chess_context.append(f"Moves played in this game: {' '.join([f'{i//2 + 1}.{move}' if i % 2 == 0 else f'{move}' for i, move in enumerate(moves_played)])}")
                else:
                    chess_context.append("No moves have been played yet (starting position)")
            
            if payload.get("fen"):
                # Parse FEN to understand game state
                fen_parts = payload['fen'].split()
                turn = "White" if fen_parts[1] == 'w' else "Black"
                move_number = fen_parts[5]
                chess_context.append(f"Current position (FEN): {payload['fen']}")
                chess_context.append(f"It is {turn}'s turn to move (move {move_number})")
                
            if payload.get("pv"):
                chess_context.append(f"Engine's suggested continuation: {' '.join(payload['pv'])} (these are recommended future moves, not moves that have been played)")
                
            if payload.get("context"):
                chess_context.append(f"Additional context: {payload['context']}")
            
            if payload.get("stockfish") and "analysis" in payload["stockfish"]:
                sf_summary = summarize_stockfish(payload["stockfish"]["analysis"])
                chess_context.append(f"Stockfish insights:\n{sf_summary}")

            # Prepend chess context to the conversation
            context_message = {
                "role": "system", 
                "content": f"You are a chess analysis AI. Analyze only moves that have actually been played in the position. When discussing the engine's suggested moves, clearly state they are recommendations for future play.\n\nCurrent chess context:\n" + "\n".join(chess_context)
            }
            llm_payload["messages"].insert(0, context_message)
        
        logger.info(f"Debug - Final LLM payload: {llm_payload}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            logger.info(f"Debug - Making request to: {LLM_URL}/v1/chat/completions")
            
            response = await client.post(
                f"{LLM_URL}/v1/chat/completions",
                json=llm_payload,
                headers={"Content-Type": "application/json"}
            )
            
            logger.info(f"Debug - Response status: {response.status_code}")
            logger.info(f"Debug - Response headers: {response.headers}")
            logger.info(f"Debug - Response text (first 500 chars): {response.text[:500]}")
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"LLM service error: {response.text}"
                )
            
            response_json = response.json()
            logger.info(f"Debug - Successfully parsed JSON response")
            return response_json
            
    except httpx.TimeoutException as e:
        logger.info(f"Debug - Timeout error: {e}")
        raise HTTPException(status_code=504, detail="LLM service timeout")
    except httpx.HTTPStatusError as e:
        logger.info(f"Debug - HTTP status error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=f"LLM HTTP error: {e}")
    except Exception as e:
        logger.info(f"Debug - Unexpected error: {type(e).__name__}: {e}")
        import traceback
        logger.info(f"Debug - Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"LLM service error: {str(e)}")
    
@app.post("/analyze")
async def analyze(payload: dict):
    # Clamp depth to server maximum (40); frontend enforces plan-based limits
    if "depth" in payload:
        payload["depth"] = min(int(payload["depth"]), 40)
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Stockfish analysis
        try:
            sf_resp = await client.post(f"{STOCKFISH_URL}/analyze", json=payload)
            stockfish_result = sf_resp.json()
        except Exception as e:
            stockfish_result = {"error": str(e)}

        # ECO lookup
        try:
            eco_resp = await client.post(f"{ECO_URL}/eco", json={"fen": payload.get("fen")})
            eco_result = eco_resp.json()
        except Exception as e:
            eco_result = {"error": str(e)}

        # Update classifications to mark book moves (if position after best move is in ECO database)
        if "error" not in stockfish_result:
            current_fen = payload.get("fen")
            if current_fen:
                stockfish_result = await update_book_move_classifications(
                    stockfish_result, current_fen, client
                )

    return {
        "stockfish": stockfish_result,
        "eco": eco_result
    }

# SECURITY COMPUTE-2: Rate limited LLM analysis with daily cap
@app.post("/chess/analyze_with_llm")
@limiter.limit(get_llm_limit)
async def analyze_with_llm(request: Request, payload: dict):
    # Check daily limit before expensive GPU call
    check_daily_limit(request)

    increment_analysis_requests("/chess/analyze_with_llm")
    tracer = get_tracer()
    logger.info("[LLM] analyze_with_llm called")
    logger.info(f"[DEBUG] /chess/analyze_with_llm called with include_llm={payload.get('include_llm')}")
    logger.info(f"[DEBUG] LLM_URL={LLM_URL}")

    payload["multipv"] = max(payload.get("multipv", 3), 3)
    payload["rich_analysis"] = True  #tactical data

    async with httpx.AsyncClient(timeout=180.0) as client:
        results = {}

        # --- Stockfish analysis ---
        try:
            logger.info("[LLM] getting stockfish analysis")
            stockfish_start = time.perf_counter()
            sf_resp = await client.post(f"{STOCKFISH_URL}/analyze", json=payload)
            record_external_api_duration("stockfish", (time.perf_counter() - stockfish_start) * 1000)
            results["stockfish"] = sf_resp.json()
            logger.info("[LLM] got stockfish analysis")
        except Exception as e:
            results["stockfish"] = {"error": str(e)}

        # --- ECO data ---
        try:
            logger.info("[LLM] getting eco data")
            eco_start = time.perf_counter()
            eco_resp = await client.post(f"{ECO_URL}/eco", json={"fen": payload.get("fen")})
            record_external_api_duration("eco", (time.perf_counter() - eco_start) * 1000)
            results["eco"] = eco_resp.json()
            logger.info("[LLM] got eco data")
        except Exception as e:
            results["eco"] = {"error": str(e)}

        # Update classifications to mark book moves (if position after best move is in ECO database)
        if "error" not in results.get("stockfish", {}):
            current_fen = payload.get("fen")
            if current_fen:
                results["stockfish"] = await update_book_move_classifications(
                    results["stockfish"], current_fen, client
                )

        # --- LLM commentary with tactical context ---
        logger.info(f"[DEBUG] About to check include_llm: {payload.get('include_llm', False)}")
        if payload.get("include_llm", False):
            logger.info("[LLM] include_llm is true")
            logger.info(f"[LLM] Starting LLM analysis request...")
            try:
                fen = payload.get("fen", "")
                current_fen = payload.get("current_fen", fen)  
                last_move = payload.get("last_move")
                move_from = payload.get("move_from")  # e.g., "g1" for Nf3
                move_to = payload.get("move_to")      # e.g., "f3" for Nf3
                move_history = payload.get("move_history", [])
                user_question = payload.get("user_question", "Analyze the current position.")

                # Parse FEN to get game context
                fen_parts = fen.split()
                move_number = int(fen_parts[5]) if len(fen_parts) > 5 else 1
                turn = "White" if fen_parts[1] == 'w' else "Black"
                
                # Determine game phase
                if move_number <= 10:
                    game_phase = "opening"
                elif move_number <= 25:
                    game_phase = "middlegame"
                else:
                    game_phase = "endgame"

                # Get  Stockfish analysis
                stockfish_analysis = results.get("stockfish", {}).get("analysis", [])
                best_engine_move = stockfish_analysis[0] if stockfish_analysis else None
                
                # Get opening information
                opening_info = results.get("eco", {})

                # Build tactical context from Stockfish data
                tactical_context = ""
                if best_engine_move:
                    features = best_engine_move.get("features", {})
                    tactical = best_engine_move.get("tactical_context", {})
                    attacks = best_engine_move.get("attacks", {})
                    attacked_pieces = best_engine_move.get("attacked_pieces", {})
                    flags = best_engine_move.get("flags", {})

                    tactical_details = []
                    
                    # Tactical features
                    if features:
                        tactical_details.append(f"Position features: Mobility {features.get('mobility', 'N/A')}, Center control {features.get('center_control', 'N/A')}, King safety {features.get('king_safety', 'N/A')}")
                    
                    # Safety and attackers
                    if tactical:
                        safety = tactical.get('safety', 'N/A')
                        white_attackers = tactical.get('attackers_white', [])
                        black_attackers = tactical.get('attackers_black', [])
                        if white_attackers or black_attackers:
                            tactical_details.append(f"Tactical situation: Safety {safety}, White attacking pieces: {', '.join(white_attackers) if white_attackers else 'none'}, Black attacking pieces: {', '.join(black_attackers) if black_attackers else 'none'}")
                    
                    # Square control
                    if attacks:
                        white_controlled = attacks.get('white', [])
                        black_controlled = attacks.get('black', [])
                        if white_controlled or black_controlled:
                            tactical_details.append(f"Square control: White controls {', '.join(white_controlled[:5]) if white_controlled else 'few squares'}, Black controls {', '.join(black_controlled[:5]) if black_controlled else 'few squares'}")
                    
                    # Pieces under attack
                    if attacked_pieces:
                        white_attacked = attacked_pieces.get('white', [])
                        black_attacked = attacked_pieces.get('black', [])
                        if white_attacked or black_attacked:
                            tactical_details.append(f"Pieces under attack: White pieces: {', '.join(white_attacked) if white_attacked else 'none'}, Black pieces: {', '.join(black_attacked) if black_attacked else 'none'}")
                    
                    # Special flags
                    active_flags = [k for k, v in flags.items() if v] if flags else []
                    if active_flags:
                        tactical_details.append(f"Special position features: {', '.join(active_flags)}")

                    if tactical_details:
                        tactical_context = "\n".join(tactical_details)

                if last_move:
                    display_eval = "N/A"
                    engine_classification = "N/A"
                    # Determine if this is a critical position (for response length)
                    is_opening = game_phase == "opening"
                    eval_swing = 0.0
                    is_book_move = False

                    # Build  context for the move
                    context_parts = [
                        f"Game context: Move {move_number}, {game_phase} phase",
                        f"Move played: {last_move}",
                        f"Turn after move: {'Black' if turn == 'White' else 'White'} to move",
                        f"Position when move was played: {fen}"
                    ]
                    
                    if current_fen != fen:
                        context_parts.append(f"Position after move: {current_fen}")
                    
                    # Add move history if available
                    if move_history:
                        recent_moves = move_history[-6:]  # Last 3 moves (6 half-moves)
                        context_parts.append(f"Recent moves: {' '.join(recent_moves)}")
                    
                    # Add opening information
                    if opening_info.get("name"):
                        context_parts.append(f"Opening: {opening_info.get('name')} ({opening_info.get('eco', '')})")
                        if is_opening and move_number <= 5:
                            is_book_move = True  # Likely a book opening move

                    # Add engine evaluation with tactical context
                    if best_engine_move:
                        raw_eval = best_engine_move.get("score", "N/A")
                        engine_best = best_engine_move.get("move", "N/A")
                        engine_classification = best_engine_move.get("classification", "N/A")
                        
                        # Convert centipawn score to readable format
                        if isinstance(raw_eval, (int, float)):
                            pawn_eval = raw_eval / 100.0
                            if pawn_eval > 0:
                                display_eval = f"+{pawn_eval:.2f}"
                            elif pawn_eval < 0:
                                display_eval = f"{pawn_eval:.2f}"
                            else:
                                display_eval = "0.00"
                        else:
                            display_eval = str(raw_eval)
                        
                        context_parts.append(f"Engine evaluation: {display_eval} ({engine_classification})")
                        
                        # Calculate eval swing from second-best move to determine criticality
                        move_matches_engine = (engine_best == last_move)

                        if len(stockfish_analysis) > 1 and isinstance(raw_eval, (int, float)):
                            second_eval = stockfish_analysis[1].get("score")
                            if isinstance(second_eval, (int, float)):
                                eval_swing = abs(raw_eval - second_eval) / 100.0  # Difference in pawns

                        # Handle engine move recommendations
                        if move_matches_engine:
                            # The played move matches engine's top choice
                            context_parts.append(f"Engine's top choice: {engine_best} (the played move)")
                            # Get second best if available
                            if len(stockfish_analysis) > 1:
                                second_best = stockfish_analysis[1].get("move", "N/A")
                                second_eval = stockfish_analysis[1].get("score", "N/A")
                                if isinstance(second_eval, (int, float)):
                                    second_pawn_eval = second_eval / 100.0
                                    second_display = f"+{second_pawn_eval:.2f}" if second_pawn_eval > 0 else f"{second_pawn_eval:.2f}"
                                else:
                                    second_display = str(second_eval)
                                context_parts.append(f"Engine's second choice: {second_best} (eval: {second_display})")
                        else:
                            # The played move differs from engine recommendation
                            context_parts.append(f"Engine's top choice: {engine_best}")
                            context_parts.append(f"Note: The played move {last_move} differs from engine recommendation")
                        
                        # Add tactical context
                        if tactical_context:
                            context_parts.append(f"Tactical analysis:\n{tactical_context}")

                    # Prepare context for LLM with full tactical data
                    context_parts = []
                    # Determine which side played the move
                    # fen is the position BEFORE the move, so 'turn' is the side who played the move
                    logger.info(f"[LLM DEBUG] FEN: {fen}")
                    logger.info(f"[LLM DEBUG] Turn from FEN: {turn}")
                    side_who_moved = turn
                    logger.info(f"[LLM DEBUG] Side who moved: {side_who_moved}")
                    
                    # Include move squares if available
                    if move_from and move_to:
                        context_parts.append(f"{side_who_moved}'s move: {last_move} (from {move_from} to {move_to})")
                    else:
                        context_parts.append(f"{side_who_moved}'s move: {last_move}")
                    context_parts.append(f"Engine evaluation: {display_eval} ({engine_classification})")
                    context_parts.append(f"Game phase: {game_phase}")

                    if opening_info.get('name'):
                        context_parts.append(f"Opening: {opening_info['name']}")

                    # Add explicit board state to prevent hallucinations
                    # Use current_fen (AFTER move) so the board state matches the "move has been played" context
                    board_description = parse_fen_to_board_description(current_fen)
                    context_parts.append(f"\n{board_description}")

                    # Add tactical context if available
                    if tactical_context:
                        context_parts.append(f"\nTactical analysis:\n{tactical_context}")

                    context = "\n".join(context_parts)

                    # Direct question with rich context
                    user_prompt = f"{context}\n\nDescribe what {side_who_moved}'s move {last_move} achieves in this position."

                    llm_messages = [
                        {
                            "role": "system",
                            "content": f"""You are a chess coach. You MUST analyze the move {last_move} that {side_who_moved} just played.

CRITICAL - READ THE BOARD STATE CAREFULLY:
The board description shows the CURRENT position AFTER moves have been played.
- If you see "White has: pawns on a2, b2, c2, d4, e4..." this means the e4 pawn HAS MOVED from e2 to e4
- If you see "Black has: pawns on a7, b7, c7, d7, e6..." this means the e7 pawn HAS MOVED to e6
- DO NOT say "all pieces are on starting squares" - READ THE ACTUAL SQUARES LISTED

YOUR TASK:
1. Begin with: "The move {last_move}..." and describe its immediate purpose
2. State what square the piece moved FROM and TO (this will be provided)
3. Mention what this move controls, attacks, or opens up
4. Keep response to 2-3 sentences

EXAMPLE: "The move e4 advances White's king pawn from e2 to e4, immediately controlling the central d5 and f5 squares and opening lines for the queen and king's bishop."""
                        },
                        {"role": "user", "content": user_prompt}
                    ]

                    max_tokens = 700  # Allow model to finish reasoning AND generate content
                else:
                    # General position analysis with tactical context
                    analysis_summary = ""
                    if stockfish_analysis:
                        top_moves = stockfish_analysis[:3]
                        analysis_summary = f"Top engine moves:\n"
                        for i, move_data in enumerate(top_moves, 1):
                            move = move_data.get("move", "?")
                            raw_score = move_data.get("score", "?")
                            classification = move_data.get("classification", "?")
                            
                            # Format score
                            if isinstance(raw_score, (int, float)):
                                pawn_score = raw_score / 100.0
                                display_score = f"+{pawn_score:.2f}" if pawn_score > 0 else f"{pawn_score:.2f}"
                            else:
                                display_score = str(raw_score)
                            
                            analysis_summary += f"{i}. {move} (eval: {display_score}, {classification})\n"
                        
                        # Add tactical context for position analysis
                        if tactical_context:
                            analysis_summary += f"\nTactical situation:\n{tactical_context}"
                    
                    user_prompt = f"""
Current position (FEN): {fen}
Game phase: {game_phase} (move {move_number})
{f"Opening: {opening_info.get('name', '')}" if opening_info.get('name') else ""}

{analysis_summary}

Question: {user_question}

Provide specific analysis of this position using the engine data and tactical information provided.
"""
                    
                    llm_messages = [
                        {
                            "role": "system",
                            "content": "You are a concise chess coach. Provide brief, focused analysis. Avoid tables and excessive formatting."
                        },
                        {"role": "user", "content": user_prompt}
                    ]
                    max_tokens = 350  # General position analysis

                logger.info(f"[LLM] Preparing LLM request...")
                logger.info(f"[LLM] Message count: {len(llm_messages)}, max_tokens: {max_tokens}")
                logger.info(f"[LLM DEBUG] System message: {llm_messages[0]['content'][:200]}...")
                logger.info(f"[LLM DEBUG] User prompt: {llm_messages[1]['content'][:500]}...")

                # Import fallback client
                from llm_fallback import call_fallback_llm

                # Track paid user session if authenticated
                user_id = getattr(request.state, "user_id", None)
                if user_id:
                    register_paid_session(user_id)

                # Check if we should use Modal GPU (threshold + cold start logic)
                use_modal, routing_reason = should_use_modal_gpu()
                logger.info(f"[LLM] Routing decision: use_modal={use_modal}, reason={routing_reason}")

                # Strategy: Use Modal GPU only when threshold met AND GPU is hot
                llm_provider = "unknown"
                llm_started_at = None
                llm_latency_ms = None
                llm_timer = None

                try:
                    if not use_modal:
                        # Below threshold or GPU cold - use Groq/fallback immediately
                        logger.info(f"[LLM] Using fallback: {routing_reason}")
                        llm_started_at = time.time()
                        llm_timer = time.perf_counter()
                        with tracer.start_as_current_span("llm.request"):
                            with tracer.start_as_current_span("llm.queue.wait") as queue_span:
                                llm_resp_data = await call_fallback_llm(
                                    messages=llm_messages,
                                    max_tokens=max_tokens,
                                    temperature=0.7
                                )
                        llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
                        queue_span.set_attribute("wait.ms", llm_latency_ms)
                        if isinstance(llm_resp_data, dict):
                            llm_resp_data["_started_at"] = llm_started_at
                            llm_resp_data["_latency_ms"] = llm_latency_ms
                        llm_provider = llm_resp_data.get("_fallback_provider", "openai-fallback")
                        record_external_api_duration(llm_provider, llm_latency_ms)
                        if isinstance(llm_resp_data, dict):
                            usage = llm_resp_data.get("usage") or {}
                            record_llm_tokens(
                                llm_provider,
                                llm_resp_data.get("_model") or llm_resp_data.get("model") or "unknown",
                                usage.get("total_tokens") if usage else None,
                            )

                        # Background task: ping GPU to wake it up
                        async def wake_gpu():
                            try:
                                logger.info("[LLM] Background: Waking up GPU...")
                                await client.post(
                                    f"{LLM_URL}/v1/chat/completions",
                                    json={
                                        "model": "llm",
                                        "messages": [{"role": "user", "content": "ping"}],
                                        "max_tokens": 5,
                                    },
                                    timeout=120.0
                                )
                                update_gpu_status()
                                logger.info("[LLM] Background: GPU warmed up successfully")
                            except Exception as e:
                                logger.info(f"[LLM] Background: Failed to wake GPU: {e}")

                        asyncio.create_task(wake_gpu())

                        # Check if fallback returned error
                        if "error" in llm_resp_data:
                            results["llm"] = llm_resp_data
                            logger.info("[LLM] analyze_with_llm finished (fallback error)")
                            return results

                        llm_data = llm_resp_data
                    else:
                        # GPU should be hot - try it with shorter timeout
                        logger.info(f"[LLM] GPU should be hot - trying Modal endpoint: {LLM_URL}/v1/chat/completions")

                        try:
                            llm_started_at = time.time()
                            llm_timer = time.perf_counter()
                            increment_gpu_jobs("modal-gpu")
                            set_gpu_slots_in_use(1)
                            try:
                                with tracer.start_as_current_span("llm.request") as llm_span:
                                    llm_span.set_attribute("provider", "modal-gpu")
                                    with tracer.start_as_current_span("gpu.execution"):
                                        with tracer.start_as_current_span("gpu.queue.wait") as queue_span:
                                            llm_resp = await client.post(
                                                f"{LLM_URL}/v1/chat/completions",
                                                json={
                                                    "model": "llm",  # Modal Hermes-3-Llama-3.1-8B served model name
                                                    "messages": llm_messages,
                                                    "max_tokens": max_tokens,
                                                    "temperature": 0.7,
                                                    "stream": False,
                                                    "n": 1,
                                                    "presence_penalty": 0.1,
                                                },
                                                timeout=30.0,  # Shorter timeout when GPU should be hot
                                            )
                                            llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
                                            queue_span.set_attribute("wait.ms", llm_latency_ms)
                                            record_gpu_queue_wait(llm_latency_ms)

                                # GPU responded! Update status
                                update_gpu_status()
                                llm_provider = "modal-gpu"
                                record_external_api_duration(llm_provider, llm_latency_ms)
                                logger.info(f"[LLM] GPU response successful")
                            finally:
                                set_gpu_slots_in_use(0)

                        except httpx.TimeoutException:
                            # GPU timed out - fallback to API
                            logger.info(f"[LLM] GPU timed out - falling back to OpenAI")
                            if llm_started_at is not None:
                                switch_elapsed_ms = int((time.perf_counter() - llm_timer) * 1000)
                                logger.info(f"[LLM] GPU timeout after {switch_elapsed_ms} ms, switching to fallback")
                            llm_started_at = time.time()
                            llm_timer = time.perf_counter()
                            with tracer.start_as_current_span("llm.request"):
                                with tracer.start_as_current_span("llm.queue.wait") as queue_span:
                                    llm_resp_data = await call_fallback_llm(
                                        messages=llm_messages,
                                        max_tokens=max_tokens,
                                        temperature=0.7
                                    )
                            llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
                            queue_span.set_attribute("wait.ms", llm_latency_ms)
                            if isinstance(llm_resp_data, dict):
                                llm_resp_data["_started_at"] = llm_started_at
                                llm_resp_data["_latency_ms"] = llm_latency_ms
                            llm_provider = llm_resp_data.get("_fallback_provider", "openai-fallback-after-timeout")
                            record_external_api_duration(llm_provider, llm_latency_ms)
                            if isinstance(llm_resp_data, dict):
                                usage = llm_resp_data.get("usage") or {}
                                record_llm_tokens(
                                    llm_provider,
                                    llm_resp_data.get("_model") or llm_resp_data.get("model") or "unknown",
                                    usage.get("total_tokens") if usage else None,
                                )

                            # Check if fallback returned error
                            if "error" in llm_resp_data:
                                results["llm"] = llm_resp_data
                                logger.info("[LLM] analyze_with_llm finished (fallback error after timeout)")
                                return results

                            llm_data = llm_resp_data

                            # Background: try to wake GPU
                            async def wake_gpu():
                                try:
                                    logger.info("[LLM] Background: Waking up GPU after timeout...")
                                    await client.post(
                                        f"{LLM_URL}/v1/chat/completions",
                                        json={
                                            "model": "llm",
                                            "messages": [{"role": "user", "content": "ping"}],
                                            "max_tokens": 5,
                                        },
                                        timeout=120.0
                                    )
                                    update_gpu_status()
                                    logger.info("[LLM] Background: GPU warmed up successfully after timeout")
                                except Exception as e:
                                    logger.info(f"[LLM] Background: Failed to wake GPU: {e}")

                            asyncio.create_task(wake_gpu())

                        # If we got here with GPU path, parse the response
                        if llm_provider == "modal-gpu":
                            logger.info(f"[LLM] Response status: {llm_resp.status_code}")

                            # Check for rate limiting or other HTTP errors
                            if llm_resp.status_code == 429:
                                logger.info(f"[LLM] Rate limited by Modal - returning error")
                                results["llm"] = {
                                    "error": "Rate limit exceeded. Please wait a moment and try again.",
                                    "status_code": 429
                                }
                                logger.info("[LLM] analyze_with_llm finished")
                                return results
                            elif llm_resp.status_code != 200:
                                logger.info(f"[LLM] HTTP error {llm_resp.status_code} - returning error")
                                results["llm"] = {
                                    "error": f"LLM service error (HTTP {llm_resp.status_code})",
                                    "status_code": llm_resp.status_code
                                }
                                logger.info("[LLM] analyze_with_llm finished")
                                return results

                            llm_data = llm_resp.json()
                            logger.info(f"[LLM] Response keys: {list(llm_data.keys())}")
                            usage = llm_data.get("usage") if isinstance(llm_data, dict) else None
                            record_llm_tokens(
                                llm_provider,
                                llm_data.get("model") or "llm",
                                usage.get("total_tokens") if usage else None,
                            )

                except httpx.TimeoutException:
                    if llm_started_at is not None and llm_timer is not None:
                        logger.info(f"[LLM] Unexpected timeout after {int((time.perf_counter() - llm_timer) * 1000)} ms")
                    logger.info(f"[LLM] Unexpected timeout exception (shouldn't reach here with fallback)")
                    results["llm"] = {
                        "error": "AI analysis is taking too long. The service may be starting up. Please try again in a moment.",
                        "status_code": 504
                    }
                    logger.info("[LLM] analyze_with_llm finished")
                    return results
                except httpx.RequestError as e:
                    logger.info(f"[LLM] Modal request failed: {str(e)}")
                    results["llm"] = {
                        "error": f"AI service unavailable: {str(e)}",
                        "status_code": 503
                    }
                    logger.info("[LLM] analyze_with_llm finished")
                    return results

                # Handle Harmony response format (GPT-OSS): use reasoning_content if content is empty
                if llm_data.get("choices") and len(llm_data["choices"]) > 0:
                    message = llm_data["choices"][0].get("message", {})
                    reasoning = message.get("reasoning_content", "")
                    content = message.get("content", "")

                    logger.info(f"[LLM] DEBUG - reasoning_content: {reasoning[:100] if reasoning else 'EMPTY'}")
                    logger.info(f"[LLM] DEBUG - content: {content[:100] if content else 'EMPTY'}")

                    # GPT-OSS often puts response in reasoning_content
                    if reasoning and not content:
                        # Clean up reasoning content: remove meta-commentary about task
                        cleaned = reasoning
                        # Remove common meta phrases
                        meta_phrases = [
                            "We need to provide",
                            "We need to respond",
                            "We need to write",
                            "We need to explain",
                            "The user wants",
                            "Let me provide",
                            "I need to",
                        ]
                        for phrase in meta_phrases:
                            if phrase in cleaned:
                                # Try to extract the actual analysis after the meta phrase
                                parts = cleaned.split(phrase, 1)
                                if len(parts) > 1:
                                    # Look for the actual chess content
                                    remaining = parts[1]
                                    # Find first sentence that looks like actual analysis
                                    sentences = remaining.split('.')
                                    for i, sent in enumerate(sentences):
                                        if any(word in sent.lower() for word in ['controls', 'develops', 'attacks', 'defends', 'prepares', 'opens', 'pressure', 'space', 'center']):
                                            cleaned = '.'.join(sentences[i:])
                                            break

                        message["content"] = cleaned.strip()
                        logger.info(f"[LLM] Using cleaned reasoning_content as content")
                    elif reasoning and content:
                        message["content"] = content  # Prefer content if both exist
                        logger.info(f"[LLM] Using content (both exist)")

                    # Fallback if both are empty
                    if not message.get("content") or not message["content"].strip():
                        message["content"] = f"{last_move} - Engine evaluation: {display_eval}"
                        logger.info(f"[LLM] Using fallback")

                # Add provider metadata to response
                llm_data["_provider"] = llm_provider
                llm_data["_gpu_was_cold"] = gpu_cold

                results["llm"] = llm_data
                logger.info(f"[LLM] Provider used: {llm_provider}")
                logger.info(f"[LLM] Final content: {llm_data.get('choices', [{}])[0].get('message', {}).get('content', 'NO CONTENT')[:100]}")
                if isinstance(llm_data, dict):
                    if llm_started_at is not None:
                        llm_data["_started_at"] = llm_started_at
                    if llm_latency_ms is not None:
                        llm_data["_latency_ms"] = llm_latency_ms
                        logger.info(f"[LLM] Latency ({llm_provider}): {llm_latency_ms} ms")

            except Exception as e:
                logger.info(f"[LLM] ERROR: {str(e)}")
                import traceback
                logger.info(f"[LLM] Traceback: {traceback.format_exc()}")
                results["llm"] = {"error": str(e)}

        # Log activity
        user_id, session_id = get_owner_from_request(request)
        pool = await get_pool()
        await log_activity(
            pool, user_id, session_id, "game_analyzed",
            meta={"fen": payload.get("fen"), "include_llm": payload.get("include_llm")}
        )

        logger.info("[LLM] analyze_with_llm finished")
        return results


@app.post("/chess/analyze_with_llm/stream")
async def analyze_with_llm_stream(payload: dict):
    """
    Streaming version of analyze_with_llm endpoint.
    Returns Server-Sent Events (SSE) with status updates and text chunks.

    Events:
    - status: {"type": "status", "provider": "gpu|api|cached", "gpu_cold": bool}
    - chunk: {"type": "chunk", "text": "..."}
    - complete: {"type": "complete", "full_response": {...}}
    - error: {"type": "error", "error": "..."}
    """
    from fastapi.responses import StreamingResponse
    from llm_fallback import call_fallback_llm_streaming
    import json

    async def event_generator():
        tracer = get_tracer()
        stream_complete_span = tracer.start_span("stream.complete")
        first_chunk_span = tracer.start_span("stream.first_chunk")
        first_chunk_sent = False

        def mark_first_chunk() -> None:
            nonlocal first_chunk_sent
            if first_chunk_sent:
                return
            first_chunk_sent = True
            first_chunk_span.end()

        try:
            increment_analysis_requests("/chess/analyze_with_llm/stream")
            # Extract request parameters
            fen = payload.get("fen")
            current_fen = payload.get("current_fen", fen)
            last_move = payload.get("last_move")
            move_from = payload.get("move_from")  # e.g., "g1" for Nf3
            move_to = payload.get("move_to")      # e.g., "f3" for Nf3
            include_llm = payload.get("include_llm", True)
            
            # 3-Tier Mode Routing:
            # - "heuristics" (default): Local heuristics only, <100ms, never calls GPU
            # - "lc0": On-demand LC0 concept analysis (A10G GPU)
            # - "llm": On-demand LLM commentary (L40S GPU)
            mode = payload.get("mode", "heuristics")  # Default to fast local path
            stream_complete_span.set_attribute("mode", mode)
            
            llm_started_at = None
            llm_latency_ms = None
            llm_timer = None
            current_provider = None

            if not fen:
                yield f"data: {json.dumps({'type': 'error', 'error': 'FEN is required'})}\n\n"
                return

            # Get stockfish and eco data (non-streaming)
            results = {}

            # Get stockfish analysis
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    depth = payload.get("depth", 18)
                    stockfish_start = time.perf_counter()
                    sf_resp = await client.post(
                        f"{STOCKFISH_URL}/analyze",
                        json={"fen": fen, "depth": depth}
                    )
                    record_external_api_duration("stockfish", (time.perf_counter() - stockfish_start) * 1000)
                    results["stockfish"] = sf_resp.json()
                except Exception as e:
                    results["stockfish"] = {"error": str(e)}

                # Get ECO data
                try:
                    eco_start = time.perf_counter()
                    eco_resp = await client.get(f"{ECO_URL}/classify?fen={fen}")
                    record_external_api_duration("eco", (time.perf_counter() - eco_start) * 1000)
                    results["eco"] = eco_resp.json()
                except Exception as e:
                    results["eco"] = {"error": str(e)}

                # Update classifications to mark book moves (if position after best move is in ECO database)
                if "error" not in results.get("stockfish", {}):
                    results["stockfish"] = await update_book_move_classifications(
                        results["stockfish"], fen, client
                    )

            # If LLM not requested, return immediately
            if not include_llm:
                yield f"data: {json.dumps({'type': 'complete', 'full_response': results})}\n\n"
                return

            # =====================================================
            # TIER 1: Local Heuristics (ALWAYS runs, <100ms)
            # =====================================================
            # Heuristics NEVER block on GPU services
            tier1_start = time.perf_counter()
            
            try:
                # Compute position heuristics locally
                heuristics = calculate_position_heuristics(
                    current_fen,
                    ply_count=None
                )
                
                # Get stockfish results
                stockfish_info = results.get("stockfish", {})
                eco_info = results.get("eco", {})
                
                # Build engine eval display
                eval_cp = stockfish_info.get("evaluation", {}).get("value")
                eval_mate = stockfish_info.get("evaluation", {}).get("mate")
                best_move = stockfish_info.get("best_move", "")
                
                if eval_mate is not None:
                    display_eval = f"Mate in {abs(eval_mate)}"
                elif eval_cp is not None:
                    display_eval = f"{eval_cp / 100.0:+.2f}"
                else:
                    display_eval = None
                
                # Compute move facts if we have move info
                move_facts = None
                if last_move and move_from and move_to:
                    move_facts = compute_move_facts(fen, current_fen, move_from, move_to, last_move)
                
                # Build meta info
                meta = {
                    "game_phase": heuristics.get("position_facts", {}).get("phase", "middlegame"),
                    "eco": {"code": eco_info.get("eco", ""), "name": eco_info.get("name", "")} if eco_info else None,
                }
                
                # Build engine info
                engine_info = {
                    "display_eval": display_eval,
                    "best_move": best_move if best_move else None,
                }
                
                # Build opening info
                opening_info = {
                    "eco_code": eco_info.get("eco", ""),
                    "name": eco_info.get("name", ""),
                } if eco_info else {}
                
                # Generate local heuristic commentary (SUB-SECOND!)
                heuristic_commentary = render_non_llm_commentary(
                    heuristics=heuristics,
                    ply_count=None,
                    meta=meta,
                    fen=current_fen,
                    move_facts=move_facts,
                    last_move_san=last_move,
                    engine=engine_info,
                    opening=opening_info,
                )
                
                tier1_latency_ms = int((time.perf_counter() - tier1_start) * 1000)
                
                # Get commentary text
                commentary_text = heuristic_commentary.get("text", "Analysis complete.")
                
                # Add heuristics to results
                results["heuristic_commentary"] = heuristic_commentary
                
                # Generate best move commentary if it differs from played move
                if best_move and last_move and best_move != last_move:
                    try:
                        import chess
                        board = chess.Board(fen)
                        best_move_obj = board.parse_san(best_move)
                        best_from = chess.square_name(best_move_obj.from_square)
                        best_to = chess.square_name(best_move_obj.to_square)
                        board.push(best_move_obj)
                        best_fen = board.fen()
                        
                        best_move_facts = compute_move_facts(fen, best_fen, best_from, best_to, best_move)
                        best_move_heuristics = calculate_position_heuristics(best_fen, ply_count=None)
                        best_move_commentary = render_non_llm_commentary(
                            heuristics=best_move_heuristics,
                            ply_count=None,
                            meta=meta,
                            fen=best_fen,
                            move_facts=best_move_facts,
                            last_move_san=best_move,
                            engine=engine_info,
                            opening=opening_info,
                        )
                        results["best_move_commentary"] = best_move_commentary
                        logger.info(f"[BEST MOVE COMMENTARY] Generated for {best_move}: {best_move_commentary.get('text', '')[:80]}...")
                    except Exception as e:
                        logger.info(f"[BEST MOVE COMMENTARY] Error generating commentary for {best_move}: {e}")
                
                results["llm"] = {
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": commentary_text
                        }
                    }],
                    "_provider": "local-heuristics",
                    "_latency_ms": tier1_latency_ms,
                }
                
                logger.info(f"[TIER 1 HEURISTICS] Generated in {tier1_latency_ms}ms: {commentary_text[:80]}...")
                
            except Exception as e:
                logger.info(f"[TIER 1 HEURISTICS] Error: {e}")
                tier1_latency_ms = int((time.perf_counter() - tier1_start) * 1000)
                commentary_text = "Analysis in progress..."
                heuristics = {}
                move_facts = None
            
            # =====================================================
            # MODE: heuristics - Return immediately (<100ms guaranteed)
            # =====================================================
            if mode == "heuristics":
                yield f"data: {json.dumps({'type': 'status', 'provider': 'local-heuristics', 'mode': 'heuristics'})}\n\n"
                mark_first_chunk()
                yield f"data: {json.dumps({'type': 'chunk', 'text': commentary_text})}\n\n"
                yield f"data: {json.dumps({'type': 'complete', 'full_response': results, 'tier': 1, 'latency_ms': tier1_latency_ms})}\n\n"
                return
            
            # =====================================================
            # MODE: lc0 - On-demand LC0 concept analysis (Tier 2)
            # =====================================================
            if mode == "lc0" and ENABLE_LC0_ANALYSIS:
                yield f"data: {json.dumps({'type': 'status', 'provider': 'lc0-concepts', 'mode': 'lc0', 'message': 'Requesting LC0 concept analysis...'})}\n\n"
                
                # Return heuristics immediately, LC0 will be loaded async
                mark_first_chunk()
                yield f"data: {json.dumps({'type': 'chunk', 'text': commentary_text})}\n\n"
                
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        lc0_timer = time.perf_counter()
                        lc0_request_start = time.perf_counter()
                        
                        # Call LC0 service
                        lc0_response = await client.post(
                            f"{LC0_SERVICE_URL}/infer",
                            json={
                                "fen": fen,
                                "move": last_move,
                                "top_k": 5,
                            },
                            headers={"Content-Type": "application/json"},
                        )
                        
                        lc0_latency_ms = int((time.perf_counter() - lc0_timer) * 1000)
                        record_external_api_duration("lc0", (time.perf_counter() - lc0_request_start) * 1000)
                        
                        if lc0_response.status_code == 200:
                            lc0_data = lc0_response.json()
                            results["lc0_concepts"] = lc0_data
                            results["lc0_latency_ms"] = lc0_latency_ms
                            logger.info(f"[TIER 2 LC0] Concepts received in {lc0_latency_ms}ms")
                        else:
                            logger.info(f"[TIER 2 LC0] Error: HTTP {lc0_response.status_code}")
                            results["lc0_error"] = f"HTTP {lc0_response.status_code}"
                            
                except Exception as e:
                    logger.info(f"[TIER 2 LC0] Exception: {e}")
                    results["lc0_error"] = str(e)
                
                yield f"data: {json.dumps({'type': 'complete', 'full_response': results, 'tier': 2, 'heuristics_latency_ms': tier1_latency_ms})}\n\n"
                return
            
            # =====================================================
            # MODE: llm - On-demand LLM commentary (Tier 3)
            # =====================================================
            if mode == "llm" and ENABLE_LLM_COMMENTARY:
                yield f"data: {json.dumps({'type': 'status', 'provider': 'llm-commentary', 'mode': 'llm', 'message': 'Requesting LLM commentary...'})}\n\n"
                
                # Return heuristics immediately
                mark_first_chunk()
                yield f"data: {json.dumps({'type': 'chunk', 'text': commentary_text})}\n\n"
                yield f"data: {json.dumps({'type': 'status', 'provider': 'llm-commentary', 'message': 'AI explanation loading...'})}\n\n"
                
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        llm_timer = time.perf_counter()
                        llm_request_start = time.perf_counter()

                        # Call LLM service
                        with tracer.start_as_current_span("llm.request"):
                            with tracer.start_as_current_span("llm.queue.wait") as queue_span:
                                llm_response = await client.post(
                                    f"{LLM_SERVICE_URL}/generate_http",
                                    json={
                                        "system_prompt": "You are a chess coach providing concise, factual commentary. Be brief.",
                                        "user_prompt": f"Position: {fen}\nMove: {last_move}\nEval: {display_eval}\n\nExplain what this move achieves in 2-3 sentences.",
                                        "max_tokens": 150,
                                        "temperature": 0.3,
                                    },
                                    headers={"Content-Type": "application/json"},
                                )
                        
                        llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
                        queue_span.set_attribute("wait.ms", llm_latency_ms)
                        record_external_api_duration("llm-commentary", (time.perf_counter() - llm_request_start) * 1000)
                        record_llm_tokens("llm-commentary", "unknown", None)
                        
                        if llm_response.status_code == 200:
                            llm_data = llm_response.json()
                            llm_text = llm_data.get("text", "")
                            
                            if llm_text:
                                # Stream the LLM response
                                mark_first_chunk()
                                yield f"data: {json.dumps({'type': 'llm_chunk', 'text': llm_text})}\n\n"
                                
                                results["llm"]["choices"][0]["message"]["content"] = llm_text
                                results["llm"]["_provider"] = "llm-commentary"
                                results["llm"]["_latency_ms"] = llm_latency_ms
                            
                            logger.info(f"[TIER 3 LLM] Commentary received in {llm_latency_ms}ms: {llm_text[:80]}...")
                        else:
                            logger.info(f"[TIER 3 LLM] Error: HTTP {llm_response.status_code}")
                            results["llm_error"] = f"HTTP {llm_response.status_code}"
                            
                except Exception as e:
                    logger.info(f"[TIER 3 LLM] Exception: {e}")
                    results["llm_error"] = str(e)
                
                yield f"data: {json.dumps({'type': 'complete', 'full_response': results, 'tier': 3, 'heuristics_latency_ms': tier1_latency_ms})}\n\n"
                return
            
            # =====================================================
            # FALLBACK: Unknown mode - return heuristics only
            # =====================================================
            yield f"data: {json.dumps({'type': 'status', 'provider': 'local-heuristics', 'mode': mode})}\n\n"
            mark_first_chunk()
            yield f"data: {json.dumps({'type': 'chunk', 'text': commentary_text})}\n\n"
            yield f"data: {json.dumps({'type': 'complete', 'full_response': results, 'tier': 1, 'latency_ms': tier1_latency_ms})}\n\n"
            return

            # =====================================================
            # SYSTEM 2: unified-chess-inference (LC0 + concepts + entropy)
            # =====================================================
            if USE_UNIFIED_INFERENCE:
                yield f"data: {json.dumps({'type': 'status', 'provider': 'unified-inference', 'message': 'Using LC0 concept analysis'})}\n\n"
                
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:  # 120s for vLLM warmup
                        llm_started_at = time.time()
                        llm_timer = time.perf_counter()
                        llm_request_start = time.perf_counter()
                        
                        # Call unified-chess-inference Modal service
                        with tracer.start_as_current_span("llm.request"):
                            with tracer.start_as_current_span("llm.queue.wait") as queue_span:
                                unified_resp = await client.post(
                                    UNIFIED_INFERENCE_URL,
                                    json={
                                        "fen": fen,
                                        "move": last_move,
                                        "engine_eval": results.get("stockfish", {}).get("evaluation", {}).get("value"),
                                    },
                                    headers={"Content-Type": "application/json"},
                                )
                        
                        llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
                        queue_span.set_attribute("wait.ms", llm_latency_ms)
                        record_external_api_duration("unified-inference", (time.perf_counter() - llm_request_start) * 1000)
                        record_llm_tokens("unified-inference", "unknown", None)
                        
                        if unified_resp.status_code == 200:
                            unified_data = unified_resp.json()
                            
                            # Extract LLM comment from unified response
                            llm_comment = unified_data.get("llm_comment", "")
                            
                            # Stream the text as chunks (simulated for non-streaming response)
                            if llm_comment:
                                mark_first_chunk()
                                yield f"data: {json.dumps({'type': 'chunk', 'text': llm_comment})}\n\n"
                            
                            # Build complete response with concept data
                            results["llm"] = {
                                "choices": [{
                                    "message": {
                                        "role": "assistant",
                                        "content": llm_comment or "Analysis complete."
                                    }
                                }],
                                "_provider": "unified-inference",
                                "_latency_ms": llm_latency_ms,
                            }
                            
                            # Include concept deltas and entropy if available
                            if "concepts" in unified_data:
                                results["concepts"] = unified_data["concepts"]
                            if "wdl_entropy" in unified_data:
                                results["wdl_entropy"] = unified_data["wdl_entropy"]
                            if "decode" in unified_data:
                                results["decode"] = unified_data["decode"]
                            
                            yield f"data: {json.dumps({'type': 'complete', 'full_response': results})}\n\n"
                            return
                        else:
                            # Unified inference failed - return error (no fallback)
                            error_msg = f"Unified inference error: HTTP {unified_resp.status_code}"
                            logger.info(f"[UNIFIED] Error {unified_resp.status_code}: {unified_resp.text[:200]}")
                            yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                            return
                            
                except Exception as e:
                    # Unified inference exception - return error (no fallback)
                    logger.info(f"[UNIFIED] Exception: {e}")
                    yield f"data: {json.dumps({'type': 'error', 'error': f'Unified inference error: {str(e)}'})}\n\n"
                    return

            # =====================================================
            # SYSTEM 1: OpenAI/Hermes-3 (existing implementation)
            # =====================================================
            # Check GPU status and paid user threshold
            use_modal, routing_reason = should_use_modal_gpu()
            gpu_cold = is_gpu_likely_cold()

            # Determine provider
            if not use_modal:
                provider = "api"
                current_provider = "api"
                yield f"data: {json.dumps({'type': 'status', 'provider': 'api', 'gpu_cold': True, 'message': 'Using OpenAI API (GPU warming up)'})}\n\n"
            else:
                provider = "gpu"
                current_provider = "gpu"
                yield f"data: {json.dumps({'type': 'status', 'provider': 'gpu', 'gpu_cold': False, 'message': 'Using Modal GPU'})}\n\n"

            # Build LLM messages
            # Use current_fen (AFTER move) so the board state matches the "move has been played" context
            board_desc = describe_board_state(current_fen)
            stockfish_info = results.get("stockfish", {})
            eco_info = results.get("eco", {})

            # Determine whose turn it is from FEN
            import chess
            try:
                board = chess.Board(fen)
                current_turn = "White" if board.turn == chess.WHITE else "Black"
                # fen is the position BEFORE the move, so 'current_turn' is the side who played the move
                side_who_moved = current_turn
                logger.info(f"[LLM STREAM DEBUG] FEN: {fen}")
                logger.info(f"[LLM STREAM DEBUG] Turn from FEN: {current_turn}")
                logger.info(f"[LLM STREAM DEBUG] Side who moved: {side_who_moved}")
            except:
                current_turn = "Unknown"
                side_who_moved = None

            eval_cp = stockfish_info.get("evaluation", {}).get("value")
            eval_mate = stockfish_info.get("evaluation", {}).get("mate")
            best_move = stockfish_info.get("best_move", "")

            if eval_mate is not None:
                display_eval = f"Mate in {abs(eval_mate)}"
            elif eval_cp is not None:
                display_eval = f"{eval_cp / 100.0:+.2f}"
            else:
                display_eval = "N/A"

            eco_code = eco_info.get("eco", "")
            opening_name = eco_info.get("name", "")

            # Compute move facts to prevent LLM hallucinations
            move_facts = None
            if last_move and move_from and move_to:
                move_facts = compute_move_facts(fen, current_fen, move_from, move_to, last_move)
                logger.info(f"[LLM STREAM DEBUG] Computed move facts: {move_facts}")

            # Build system message with perspective
            if side_who_moved and last_move and move_facts and "error" not in move_facts:
                # NEW: Fact-based narration system prompt
                system_content = f"""You are a chess coach. Your job is to NARRATE the COMPUTED FACTS about the move {last_move}.

⚠️ CRITICAL - ONLY STATE PROVIDED FACTS:
- You MUST ONLY describe facts that are EXPLICITLY listed below
- DO NOT deduce or infer any chess consequences on your own
- DO NOT claim lines are opened unless explicitly stated in "lines_opened"
- DO NOT claim rooks are connected unless "rooks_connected" is true
- If a fact field is empty or says "none", do NOT mention that aspect

YOUR TASK:
1. Start with: "The move {last_move} advances {side_who_moved}'s {move_facts.get('piece_type', 'piece')} from {move_facts.get('from_square', '?')} to {move_facts.get('to_square', '?')}"
2. Mention central squares controlled (ONLY from "central_squares_controlled")
3. Mention pieces defended (ONLY from "pieces_defended")
4. Mention lines opened (ONLY from "lines_opened")
5. If HANGING PIECES are listed, you MUST warn about them (e.g., "However, this leaves the knight on c6 undefended")
6. Keep to 2-3 sentences total

EXAMPLE: "The move Nf3 advances White's knight from g1 to f3, controlling the central d4 and e5 squares."

EXAMPLE WITH HANGING PIECE: "The move a6 advances Black's pawn from a7 to a6. However, this does not address the threat to the knight on c6, which is under attack."""
            elif side_who_moved and last_move:
                # Fallback if move_facts not available
                system_content = f"""You are a chess coach. Analyze the move {last_move} that {side_who_moved} just played.

YOUR TASK:
1. Begin with: "The move {last_move}..." and describe its purpose
2. Keep response to 2-3 sentences
3. Be specific about what the move achieves"""
            else:
                system_content = """You are a concise chess coach analyzing a chess position.

CRITICAL RULES:
1. Provide concrete, specific analysis of the position
2. Keep it brief (2-3 sentences maximum)
3. ONLY analyze pieces that are EXPLICITLY listed in the board state
4. If a square is NOT mentioned in the board description, it is EMPTY

DO NOT:
- Use opening theory to guess piece positions
- Describe pieces that aren't explicitly mentioned
- Give overly general commentary"""

            system_message = {
                "role": "system",
                "content": system_content
            }

            # Build user message with computed facts
            if last_move and side_who_moved and move_facts and "error" not in move_facts:
                # Build facts section for the LLM to narrate
                facts_lines = []
                facts_lines.append(f"Move: {last_move} ({move_facts.get('from_square', '?')} → {move_facts.get('to_square', '?')})")
                facts_lines.append(f"Piece: {side_who_moved}'s {move_facts.get('piece_type', 'piece')}")

                # Central squares
                central = move_facts.get('central_squares_controlled', [])
                if central:
                    facts_lines.append(f"Central squares controlled: {', '.join(central)}")
                else:
                    facts_lines.append(f"Central squares controlled: none")

                # Other squares (limit to avoid overwhelming)
                other_squares = [sq for sq in move_facts.get('squares_controlled', []) if sq not in central]
                if other_squares:
                    facts_lines.append(f"Other squares controlled: {', '.join(other_squares[:6])}")

                # Pieces defended
                defended = move_facts.get('pieces_defended', [])
                if defended:
                    facts_lines.append(f"Pieces defended: {', '.join(defended)}")
                else:
                    facts_lines.append(f"Pieces defended: none")

                # Pieces attacked
                attacked = move_facts.get('pieces_attacked', [])
                if attacked:
                    facts_lines.append(f"Pieces attacked: {', '.join(attacked)}")
                else:
                    facts_lines.append(f"Pieces attacked: none")

                # Lines opened
                lines = move_facts.get('lines_opened', [])
                if lines:
                    facts_lines.append(f"Lines/diagonals opened for: {', '.join(lines)}")
                else:
                    facts_lines.append(f"Lines/diagonals opened: none")

                # Rooks connected
                if move_facts.get('rooks_connected', False):
                    facts_lines.append(f"Rooks connected: YES")
                else:
                    facts_lines.append(f"Rooks connected: NO")

                # Special flags
                if move_facts.get('is_check'):
                    facts_lines.append(f"Gives check: YES")
                if move_facts.get('is_capture'):
                    facts_lines.append(f"Captures: {move_facts.get('captured_piece', 'piece')}")

                # Hanging pieces (undefended pieces under attack) - IMPORTANT
                hanging = move_facts.get('hanging_pieces', [])
                if hanging:
                    facts_lines.append(f"⚠️ HANGING PIECES (under attack, insufficiently defended): {', '.join(hanging)}")

                facts_text = "\n".join(facts_lines)

                user_content = f"""COMPUTED FACTS (narrate these, do not infer beyond them):

{facts_text}

Engine evaluation: {display_eval}
Best continuation: {best_move}
Opening: {eco_code} {opening_name}

Narrate what this move achieves based ONLY on the facts above."""

            elif last_move and side_who_moved:
                # Fallback without computed facts
                if move_from and move_to:
                    move_desc = f"{side_who_moved}'s move: {last_move} (from {move_from} to {move_to})"
                else:
                    move_desc = f"{side_who_moved}'s move: {last_move}"

                user_content = f"""Position to analyze:

{board_desc}

{move_desc}
Engine evaluation: {display_eval}
Best continuation: {best_move}
Opening: {eco_code} {opening_name}

Describe what this move achieves in the position."""

            elif last_move:
                user_content = f"""Position to analyze:

{board_desc}

Last move: {last_move}
Engine evaluation: {display_eval}
Best continuation: {best_move}
Opening: {eco_code} {opening_name}

Provide a brief analysis of this position."""

            else:
                user_content = f"""Position to analyze:

{board_desc}

Starting position
Engine evaluation: {display_eval}
Best continuation: {best_move}
Opening: {eco_code} {opening_name}

Provide a brief analysis of this position."""

            user_message = {"role": "user", "content": user_content}
            llm_messages = [system_message, user_message]

            # Determine max_tokens based on game phase
            if "Opening" in opening_name or eco_code:
                max_tokens = 500
            else:
                max_tokens = 350

            # Stream from appropriate provider
            accumulated_text = ""

            try:
                if gpu_cold:
                    # Use OpenAI streaming
                    llm_started_at = time.time()
                    llm_timer = time.perf_counter()
                    llm_request_start = time.perf_counter()
                    queue_started_at = time.perf_counter()
                    queue_span = tracer.start_span("llm.queue.wait")
                    llm_provider = None
                    first_llm_chunk = False
                    with tracer.start_as_current_span("llm.request"):
                        async for chunk_data in call_fallback_llm_streaming(
                            messages=llm_messages,
                            max_tokens=max_tokens,
                            temperature=0.7
                        ):
                            if chunk_data.get("type") == "chunk":
                                if not first_llm_chunk:
                                    wait_ms = (time.perf_counter() - queue_started_at) * 1000
                                    queue_span.set_attribute("wait.ms", wait_ms)
                                    queue_span.end()
                                    first_llm_chunk = True
                                llm_provider = llm_provider or chunk_data.get("provider", "fallback")
                                text = chunk_data.get("text", "")
                                accumulated_text += text
                                mark_first_chunk()
                                yield f"data: {json.dumps({'type': 'chunk', 'text': text})}\n\n"
                            else:
                                error_message = chunk_data.get("error", "Fallback LLM streaming error")
                                logger.info(f"[LLM Stream] Fallback error: {error_message}")
                                yield f"data: {json.dumps({'type': 'error', 'error': error_message})}\n\n"
                                if not first_llm_chunk:
                                    queue_span.end()
                                return
                    if not first_llm_chunk:
                        queue_span.end()
                    if llm_provider:
                        record_external_api_duration(llm_provider, (time.perf_counter() - llm_request_start) * 1000)
                        record_llm_tokens(llm_provider, "unknown", None)
                    if llm_timer is not None and llm_latency_ms is None:
                        llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)

                    # Background: wake up GPU
                    async def wake_gpu():
                        try:
                            logger.info("[LLM] Background: Waking up GPU...")
                            async with httpx.AsyncClient(timeout=120.0) as client:
                                await client.post(
                                    f"{LLM_URL}/v1/chat/completions",
                                    json={
                                        "model": "llm",
                                        "messages": [{"role": "user", "content": "ping"}],
                                        "max_tokens": 5,
                                    }
                                )
                            update_gpu_status()
                            logger.info("[LLM] Background: GPU warmed up successfully")
                        except Exception as e:
                            logger.info(f"[LLM] Background: Failed to wake GPU: {e}")

                    asyncio.create_task(wake_gpu())

                else:
                    # Try GPU with timeout, fallback to API if needed
                    try:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            llm_started_at = time.time()
                            llm_timer = time.perf_counter()
                            increment_gpu_jobs("modal-gpu")
                            set_gpu_slots_in_use(1)
                            llm_request_start = time.perf_counter()
                            queue_started_at = time.perf_counter()
                            queue_span = tracer.start_span("gpu.queue.wait")
                            first_llm_chunk = False
                            try:
                                with tracer.start_as_current_span("llm.request"):
                                    with tracer.start_as_current_span("gpu.execution"):
                                        response = await client.post(
                                            f"{LLM_URL}/v1/chat/completions",
                                            json={
                                                "model": "llm",
                                                "messages": llm_messages,
                                                "max_tokens": max_tokens,
                                                "temperature": 0.7,
                                                "stream": True,
                                                "n": 1,
                                                "presence_penalty": 0.1,
                                            }
                                        )

                                        update_gpu_status()

                                        # Stream GPU response
                                        async for line in response.aiter_lines():
                                            if not line or line == "":
                                                continue

                                            if line.startswith("data: "):
                                                data_str = line[6:]

                                                if data_str == "[DONE]":
                                                    break

                                                try:
                                                    data = json.loads(data_str)
                                                    delta = data.get("choices", [{}])[0].get("delta", {})
                                                    content = delta.get("content", "")

                                                    if content:
                                                        if not first_llm_chunk:
                                                            wait_ms = (time.perf_counter() - queue_started_at) * 1000
                                                            queue_span.set_attribute("wait.ms", wait_ms)
                                                            record_gpu_queue_wait(wait_ms)
                                                            queue_span.end()
                                                            first_llm_chunk = True
                                                        accumulated_text += content
                                                        mark_first_chunk()
                                                        yield f"data: {json.dumps({'type': 'chunk', 'text': content})}\n\n"
                                                except json.JSONDecodeError:
                                                    continue
                            finally:
                                if not first_llm_chunk:
                                    queue_span.end()
                                record_external_api_duration("modal-gpu", (time.perf_counter() - llm_request_start) * 1000)
                                record_llm_tokens("modal-gpu", "llm", None)
                                set_gpu_slots_in_use(0)

                    except (httpx.TimeoutException, httpx.RequestError):
                        # GPU failed - fallback to API
                        if llm_timer is not None:
                            switched_after_ms = int((time.perf_counter() - llm_timer) * 1000)
                        else:
                            switched_after_ms = None
                        current_provider = "api"
                        status_payload = {
                            "type": "status",
                            "provider": "api",
                            "gpu_cold": False,
                            "message": "GPU timeout - switching to OpenAI API"
                        }
                        if switched_after_ms is not None:
                            status_payload["switched_after_ms"] = switched_after_ms
                        yield f"data: {json.dumps(status_payload)}\n\n"

                        llm_started_at = time.time()
                        llm_timer = time.perf_counter()

                        llm_request_start = time.perf_counter()
                        queue_started_at = time.perf_counter()
                        queue_span = tracer.start_span("llm.queue.wait")
                        llm_provider = None
                        first_llm_chunk = False
                        with tracer.start_as_current_span("llm.request"):
                            async for chunk_data in call_fallback_llm_streaming(
                                messages=llm_messages,
                                max_tokens=max_tokens,
                                temperature=0.7
                            ):
                                if chunk_data.get("type") == "chunk":
                                    if not first_llm_chunk:
                                        wait_ms = (time.perf_counter() - queue_started_at) * 1000
                                        queue_span.set_attribute("wait.ms", wait_ms)
                                        queue_span.end()
                                        first_llm_chunk = True
                                    llm_provider = llm_provider or chunk_data.get("provider", "fallback")
                                    text = chunk_data.get("text", "")
                                    accumulated_text += text
                                    mark_first_chunk()
                                    yield f"data: {json.dumps({'type': 'chunk', 'text': text})}\n\n"
                                else:
                                    error_message = chunk_data.get("error", "Fallback LLM streaming error")
                                    logger.info(f"[LLM Stream] Fallback error after GPU timeout: {error_message}")
                                    yield f"data: {json.dumps({'type': 'error', 'error': error_message})}\n\n"
                                    if not first_llm_chunk:
                                        queue_span.end()
                                    return
                        if not first_llm_chunk:
                            queue_span.end()
                        if llm_provider:
                            record_external_api_duration(llm_provider, (time.perf_counter() - llm_request_start) * 1000)
                            record_llm_tokens(llm_provider, "unknown", None)
                        if llm_timer is not None and llm_latency_ms is None:
                            llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)

                # Send complete event with full response
                if llm_timer is not None and llm_latency_ms is None:
                    llm_latency_ms = int((time.perf_counter() - llm_timer) * 1000)
                if current_provider is None:
                    current_provider = "api" if gpu_cold else "gpu"

                results["llm"] = {
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": accumulated_text
                        }
                    }],
                    "_provider": current_provider,
                    "_gpu_was_cold": gpu_cold
                }
                if llm_started_at is not None:
                    results["llm"]["_started_at"] = llm_started_at
                if llm_latency_ms is not None:
                    results["llm"]["_latency_ms"] = llm_latency_ms
                    logger.info(f"[LLM Stream] Provider {current_provider} latency: {llm_latency_ms} ms")

                # Generate heuristic commentary for dual-mode support
                try:
                    # Compute position heuristics for current_fen (after move)
                    heuristics = calculate_position_heuristics(
                        current_fen,
                        ply_count=None  # Could be passed from payload if available
                    )
                    
                    # Build meta info
                    meta = {
                        "game_phase": heuristics.get("position_facts", {}).get("phase", "middlegame"),
                        "eco": {"code": eco_code, "name": opening_name} if eco_code or opening_name else None,
                    }
                    
                    # Build engine info
                    engine_info = {
                        "display_eval": display_eval if display_eval != "N/A" else None,
                        "best_move": best_move if best_move else None,
                    }
                    
                    # Build opening info
                    opening_info_for_narrator = {
                        "eco_code": eco_code,
                        "name": opening_name,
                    } if eco_code or opening_name else {}
                    
                    # Generate heuristic commentary
                    heuristic_commentary = render_non_llm_commentary(
                        heuristics=heuristics,
                        ply_count=None,
                        meta=meta,
                        fen=current_fen,
                        move_facts=move_facts,
                        last_move_san=last_move,
                        engine=engine_info,
                        opening=opening_info_for_narrator,
                    )
                    
                    # Add to results
                    results["heuristic_commentary"] = heuristic_commentary
                    logger.info(f"[LLM Stream] Generated heuristic commentary: {heuristic_commentary.get('text', '')[:100]}...")
                except Exception as heur_err:
                    logger.info(f"[LLM Stream] Heuristic commentary error: {heur_err}")
                    results["heuristic_commentary"] = {
                        "headline": "Position assessment",
                        "text": "Unable to generate heuristic commentary.",
                        "tags": [],
                        "evidence": {},
                        "error": str(heur_err),
                    }

                complete_payload = {
                    "type": "complete",
                    "full_response": results
                }
                if llm_latency_ms is not None:
                    complete_payload["llm_latency_ms"] = llm_latency_ms
                if llm_started_at is not None:
                    complete_payload["llm_started_at"] = llm_started_at

                yield f"data: {json.dumps(complete_payload)}\n\n"

            except Exception as e:
                logger.info(f"[LLM Stream] ERROR: {str(e)}")
                import traceback
                logger.info(f"[LLM Stream] Traceback: {traceback.format_exc()}")
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

        except Exception as e:
            logger.info(f"[LLM Stream] Top-level ERROR: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            if not first_chunk_sent:
                first_chunk_span.end()
            stream_complete_span.end()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )
# Users sync/captcha/profile/username endpoints moved to gateway_modules/routers/users.py

# Import repertoire analysis modules
from gateway_modules.models.repertoire import (
    RepertoireAnalysisRequest,
    RepertoireReport,
    RepertoireBucketOpening,
    RepertoirePuzzle,
)
from gateway_modules.services.user_repertoire_service import UserRepertoireService
from gateway_modules.services.repertoire_service import (
    generate_repertoire_report,
    generate_repertoire_report_with_smart_import,
    validate_analysis_request,
    get_cached_report,
    cache_report
)


@app.post("/analysis/repertoire", response_model=RepertoireReport)
async def analyze_user_repertoire(
    request: RepertoireAnalysisRequest,
    http_request: Request
):
    """
    Generate a comprehensive repertoire analysis report for a user based on their imported games.

    The analysis aggregates games by ECO code and color, computes statistics,
    and classifies openings into repertoire categories with actionable insights.
    """
    try:
        increment_analysis_requests("/analysis/repertoire")
        # Derive owner from headers/cookies (Authorization or x-session-id)
        user_id, session_id = get_owner_from_request(http_request)

        # Update request with authentication info
        if user_id:
            request.user_id = user_id
        elif session_id:
            request.session_id = session_id
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either authentication token or session ID required"
            )

        # Validate request
        is_valid, error_message = validate_analysis_request(request)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_message
            )

        # Check for cached report (optional optimization)
        identifier = user_id or session_id
        cached_report = await get_cached_report(await get_pool(), identifier)
        if cached_report:
            return cached_report

        # Generate new report with smart import
        pool = await get_pool()

        # Check if this is a smart import request
        if request.import_request:
            report, import_result = await generate_repertoire_report_with_smart_import(
                pool, request, IMPORT_URL
            )

            if not report:
                error_detail = f"Insufficient data for analysis. Need at least {request.min_games} games with opening information."
                if import_result and import_result.error_message:
                    error_detail += f" Import error: {import_result.error_message}"

                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=error_detail
                )

            # Add import metadata to response if available
            if import_result:
                # Create enhanced response with import info
                response_data = jsonable_encoder(report)
                response_data['import_summary'] = import_result.import_summary
                response_data['existing_games_count'] = import_result.existing_games_count
                response_data['newly_imported_count'] = import_result.newly_imported_count
                return response_data
        else:
            # Use regular report generation without import
            report = await generate_repertoire_report(pool, request)

            if not report:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Insufficient data for analysis. Need at least {request.min_games} games with opening information."
                )

        # Cache the report (optional optimization)
        await cache_report(pool, identifier, report)

        return report

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Repertoire analysis error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )


@app.post("/analysis/repertoire/stream")
async def analyze_user_repertoire_with_progress(
    request: RepertoireAnalysisRequest,
    http_request: Request
):
    """
    Generate a repertoire analysis with streaming progress updates (for smart import).

    Returns a stream of progress updates followed by the final report.
    """
    increment_analysis_requests("/analysis/repertoire/stream")

    async def progress_generator() -> AsyncGenerator[str, None]:
        try:
            # Get authentication info from request
            user_id, session_id = get_owner_from_request(http_request)

            if not user_id and not session_id:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Authentication required'})}\n\n"
                return

            # Set up request parameters
            request.user_id = user_id
            request.session_id = session_id

            # Validate request
            is_valid, error_message = validate_analysis_request(request)
            if not is_valid:
                yield f"data: {json.dumps({'type': 'error', 'message': error_message})}\n\n"
                return

            # Progress callback to send updates to client
            async def send_progress(progress):
                update = {
                    'type': 'progress',
                    'status': progress.status,
                    'message': progress.message,
                    'existing_games': progress.existing_games,
                    'newly_imported': progress.newly_imported,
                    'total_processed': progress.total_processed
                }
                if progress.error:
                    update['error'] = progress.error

                yield f"data: {json.dumps(update)}\n\n"

            pool = await get_pool()

            # Check if this is a smart import request
            if request.import_request:
                yield f"data: {json.dumps({'type': 'progress', 'status': 'starting', 'message': 'Starting smart import analysis...'})}\n\n"

                # Collect progress updates
                progress_queue = asyncio.Queue()

                async def queue_progress(progress):
                    await progress_queue.put(progress)

                # Start the import/analysis task
                task = asyncio.create_task(
                    generate_repertoire_report_with_smart_import(
                        pool, request, IMPORT_URL, progress_callback=queue_progress
                    )
                )

                # Stream progress updates
                report = None
                import_result = None
                while not task.done():
                    try:
                        # Wait for progress update with timeout
                        progress = await asyncio.wait_for(progress_queue.get(), timeout=1.0)
                        update = {
                            'type': 'progress',
                            'status': progress.status,
                            'message': progress.message,
                            'existing_games': progress.existing_games,
                            'newly_imported': progress.newly_imported,
                            'total_processed': progress.total_processed
                        }
                        if progress.error:
                            update['error'] = progress.error

                        yield f"data: {json.dumps(update)}\n\n"

                    except asyncio.TimeoutError:
                        # Continue waiting for task completion
                        continue

                # Get final result
                try:
                    report, import_result = await task
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                    return

                # Process any remaining progress updates
                while not progress_queue.empty():
                    try:
                        progress = progress_queue.get_nowait()
                        update = {
                            'type': 'progress',
                            'status': progress.status,
                            'message': progress.message,
                            'existing_games': progress.existing_games,
                            'newly_imported': progress.newly_imported,
                            'total_processed': progress.total_processed
                        }
                        if progress.error:
                            update['error'] = progress.error

                        yield f"data: {json.dumps(update)}\n\n"
                    except asyncio.QueueEmpty:
                        break

                if not report:
                    error_detail = f"Insufficient data for analysis. Need at least {request.min_games} games with opening information."
                    if import_result and import_result.error_message:
                        error_detail += f" Import error: {import_result.error_message}"

                    yield f"data: {json.dumps({'type': 'error', 'message': error_detail})}\n\n"
                    return

                # Send final result
                result_data = jsonable_encoder(report)
                if import_result:
                    result_data['import_summary'] = import_result.import_summary
                    result_data['existing_games_count'] = import_result.existing_games_count
                    result_data['newly_imported_count'] = import_result.newly_imported_count

                yield f"data: {json.dumps({'type': 'complete', 'result': result_data})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'progress', 'status': 'analyzing', 'message': 'Analyzing...'})}\n\n"

                # Use regular report generation without import
                report = await generate_repertoire_report(pool, request)

                if not report:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Insufficient data for analysis. Need at least {request.min_games} games with opening information.'})}\n\n"
                    return

                yield f"data: {json.dumps({'type': 'complete', 'result': jsonable_encoder(report)})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Analysis error: {str(e)}'})}\n\n"

    return StreamingResponse(
        progress_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@app.get("/analysis/repertoire/{user_id}", response_model=RepertoireReport)
async def get_user_repertoire_by_id(
    user_id: str,
    min_games: int = 3,
    current_user: dict = Depends(get_current_user)
):
    """
    Get repertoire analysis for a specific user (requires authentication).
    Only the user themselves can access their repertoire data.
    """
    # Ensure user can only access their own data
    token_user_id = current_user.get("sub")
    if token_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Users can only access their own repertoire data."
        )

    request = RepertoireAnalysisRequest(
        user_id=user_id,
        min_games=min_games
    )

    try:
        pool = await get_pool()
        report = await generate_repertoire_report(pool, request)

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Insufficient data for analysis. Need at least {min_games} games with opening information."
            )

        return report

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Repertoire analysis error for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )


@app.get("/analysis/openings")
async def get_opening_statistics(
    x_session_id: Optional[str] = None,
    current_user: Optional[dict] = None,
    color: Optional[str] = None,
    min_games: int = 3
):
    """
    Get basic opening statistics without full repertoire classification.
    Returns raw opening stats that can be used for other analysis.
    """
    try:
        # Get authentication info
        user_id = None
        session_id = None

        try:
            if current_user:
                user_id = current_user.get("sub")
        except:
            pass

        if not user_id and x_session_id:
            session_id = x_session_id

        if not user_id and not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either authentication token or session ID required"
            )

        request = RepertoireAnalysisRequest(
            user_id=user_id,
            session_id=session_id,
            min_games=min_games
        )

        pool = await get_pool()
        report = await generate_repertoire_report(pool, request)

        if not report:
            return {"openings": [], "total_games": 0}

        # Extract just the opening statistics
        all_openings = []

        for category_group in report.white_repertoire.values():
            all_openings.extend(category_group.openings)

        for category_group in report.black_repertoire.values():
            all_openings.extend(category_group.openings)

        # Filter by color if specified
        if color:
            all_openings = [op for op in all_openings if op.color == color.lower()]

        return {
            "openings": all_openings,
            "total_games": report.total_games,
            "white_games": report.white_games,
            "black_games": report.black_games
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Opening statistics error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get opening statistics: {str(e)}"
        )


# Profile and linked accounts endpoints
@app.get("/profile/linked-accounts")
async def get_linked_accounts(request: Request):
    """Get user's linked accounts and settings"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get linked accounts
        if user_id:
            accounts_rows = await conn.fetch(
                "SELECT platform, username FROM linked_accounts WHERE user_id = $1 ORDER BY created_at",
                user_id
            )
            # Get show_only_my_games setting
            setting_row = await conn.fetchrow(
                "SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'show_only_my_games'",
                user_id
            )
        else:
            accounts_rows = await conn.fetch(
                "SELECT platform, username FROM linked_accounts WHERE session_id = $1 ORDER BY created_at",
                session_id
            )
            setting_row = await conn.fetchrow(
                "SELECT setting_value FROM user_settings WHERE session_id = $1 AND setting_key = 'show_only_my_games'",
                session_id
            )

        accounts = [{"platform": row["platform"], "username": row["username"]} for row in accounts_rows]
        show_only_my_games = bool(setting_row["setting_value"]) if setting_row else False

        return {
            "accounts": accounts,
            "show_only_my_games": show_only_my_games
        }


@app.post("/profile/linked-accounts")
async def add_linked_account(request: Request):
    """Add a new linked account and trigger initial game sync"""
    from gateway_modules.services.game_sync.sync_orchestrator import sync_single_provider
    
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    body = await request.json()
    platform = body.get("platform", "").strip()
    username = body.get("username", "").strip()

    if not platform or not username:
        raise HTTPException(status_code=400, detail="Platform and username are required")

    # Validate platform
    if platform not in ["chess.com", "lichess.org"]:
        raise HTTPException(status_code=400, detail="Invalid platform. Must be 'chess.com' or 'lichess.org'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """
                INSERT INTO linked_accounts (user_id, session_id, platform, username)
                VALUES ($1, $2, $3, $4)
                """,
                user_id, session_id, platform, username
            )
            
            # Trigger background sync for the newly linked provider
            asyncio.create_task(sync_single_provider(pool, user_id, session_id, platform, max_games=100))
            
            return {
                "success": True, 
                "message": "Account linked successfully. Games will sync in the background.",
                "sync_started": True
            }
        except Exception as e:
            if "unique constraint" in str(e).lower():
                raise HTTPException(status_code=400, detail="This account is already linked")
            raise HTTPException(status_code=500, detail="Failed to link account")


@app.delete("/profile/linked-accounts")
async def remove_linked_account(request: Request):
    """Remove a linked account"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    body = await request.json()
    platform = body.get("platform", "").strip()
    username = body.get("username", "").strip()

    if not platform or not username:
        raise HTTPException(status_code=400, detail="Platform and username are required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        if user_id:
            result = await conn.execute(
                "DELETE FROM linked_accounts WHERE user_id = $1 AND platform = $2 AND username = $3",
                user_id, platform, username
            )
        else:
            result = await conn.execute(
                "DELETE FROM linked_accounts WHERE session_id = $1 AND platform = $2 AND username = $3",
                session_id, platform, username
            )

        # Check if any rows were deleted
        deleted_count = int(result.split()[-1]) if result.split() else 0
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="Linked account not found")

        return {"success": True, "message": "Account unlinked successfully"}


@app.post("/profile/settings")
async def update_user_settings(request: Request):
    """Update user settings"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    body = await request.json()

    pool = await get_pool()
    async with pool.acquire() as conn:
        for setting_key, setting_value in body.items():
            if user_id:
                await conn.execute(
                    """
                    INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (user_id, setting_key)
                    DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
                    """,
                    user_id, setting_key, setting_value
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO user_settings (session_id, setting_key, setting_value, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (session_id, setting_key)
                    DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
                    """,
                    session_id, setting_key, setting_value
                )

        return {"success": True, "message": "Settings updated successfully"}


# Profile picture endpoints
@app.get("/profile/picture")
async def get_profile_picture(request: Request):
    """Get current user's profile picture"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Implicitly sync user if they don't exist yet
        auth_header = request.headers.get("Authorization", "")
        payload = decode_supabase_token(auth_header)
        email = payload.get("email") if payload else None
        
        if user_id and email:
            await conn.execute(
                """
                INSERT INTO users (id, email) 
                VALUES ($1, $2) 
                ON CONFLICT (id) DO UPDATE SET email = $2
                """,
                user_id, email
            )

        row = await conn.fetchrow(
            "SELECT profile_picture FROM users WHERE id = $1",
            user_id
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "profile_picture": row["profile_picture"]
        }


@app.post("/profile/picture")
async def update_profile_picture(request: Request):
    """
    Upload or update profile picture.
    
    SECURITY INPUT-5: Validated for size (max 2MB) and type (png/jpeg/webp only).
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    body = await request.json()
    profile_picture = body.get("profile_picture", "").strip()
    
    if not profile_picture:
        raise HTTPException(status_code=400, detail="Profile picture data is required")
    
    # Validate it's a data URL
    if not profile_picture.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Invalid image format. Must be a data URL")
    
    # SECURITY INPUT-5: Validate image type (no GIF - reduces attack surface)
    valid_types = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp"]
    if not any(profile_picture.startswith(t) for t in valid_types):
        raise HTTPException(
            status_code=415, 
            detail="Invalid image type. Supported types: PNG, JPEG, WebP"
        )
    
    # SECURITY INPUT-5: Validate size (2MB limit for base64 string)
    max_size = 2 * 1024 * 1024  # 2MB in bytes
    if len(profile_picture) > max_size:
        raise HTTPException(
            status_code=413, 
            detail="Image too large. Maximum size is 2MB"
        )
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Ensure user exists
        user_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)",
            user_id
        )
        
        if not user_exists:
            # Create user record if it doesn't exist
            await conn.execute(
                "INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
                user_id
            )
        
        # Update profile picture
        await conn.execute(
            "UPDATE users SET profile_picture = $1 WHERE id = $2",
            profile_picture,
            user_id
        )
        
        return {
            "success": True,
            "message": "Profile picture updated successfully"
        }


@app.delete("/profile/picture")
async def delete_profile_picture(request: Request):
    """Remove profile picture"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE users SET profile_picture = NULL WHERE id = $1",
            user_id
        )
        
        return {
            "success": True,
            "message": "Profile picture removed successfully"
        }
# Profile/info endpoint moved to gateway_modules/routers/users.py
# Game sync endpoints (game-history, sync-status, trigger) moved to gateway_modules/routers/game_sync.py
# Saved puzzles endpoints moved to gateway_modules/routers/puzzles.py

# Import the report storage service
from gateway_modules.services.report_storage_service import ReportStorageService
from gateway_modules.routers import repertoires as repertoires_router
from gateway_modules.routers import subscriptions as subscriptions_router

# Import new modular routers
from gateway_modules.routers import (
    studies as studies_router,
    puzzles as puzzles_router,
    health as health_router,
    games as games_router,
    imports as imports_router,
    openings as openings_router,
    game_sync as game_sync_router,
    trainer as trainer_router,
    home as home_router,
    users as users_router,
    reports as reports_router,
    analysis as analysis_router,
    async_sync as async_sync_router,
)

# Include existing routers
app.include_router(repertoires_router.router, tags=["repertoires"])
app.include_router(subscriptions_router.router, tags=["subscriptions"])

# Include new modular routers
# NOTE: Routers are now ACTIVE - duplicate endpoints in app.py can be removed incrementally
app.include_router(studies_router.router)
app.include_router(puzzles_router.router)
app.include_router(health_router.router)
app.include_router(games_router.router)
app.include_router(imports_router.router)
app.include_router(openings_router.router)
app.include_router(game_sync_router.router)
app.include_router(trainer_router.router)
app.include_router(home_router.router)
app.include_router(users_router.router)
app.include_router(reports_router.router)
app.include_router(analysis_router.router)
app.include_router(async_sync_router.router)

# User-managed repertoires (core/secondary/experimental)
@app.get("/api/repertoires")
async def list_user_repertoires(request: Request):
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required for user repertoires")
    try:
        pool = await get_pool()
        reps = await UserRepertoireService.get_user_repertoires(pool, user_id)
        return {"repertoires": [r.dict() for r in reps]}
    except Exception as e:
        logger.info(f"Error listing user repertoires: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list repertoires")


@app.post("/api/repertoires")
async def create_user_repertoire(request: Request):
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required for user repertoires")
    body = await request.json()
    name = body.get("name", "").strip()
    rep_type = body.get("type") or body.get("category")  # Support both 'type' and 'category'
    color = body.get("color", "both")
    openings_data = body.get("openings", [])
    puzzles_data = body.get("puzzles", [])
    time_control = body.get("time_control")

    if not name or not rep_type:
        raise HTTPException(status_code=400, detail="Missing name or type")

    try:
        openings = [
            {"eco_code": o.get("eco_code") or o.get("eco"), "color": o["color"], "note": o.get("note")}
            for o in openings_data if (o.get("eco_code") or o.get("eco")) and o.get("color")
        ]
        openings_models = [RepertoireBucketOpening(**o) for o in openings]
        puzzles_models = [
            RepertoirePuzzle(
                puzzle_id=p["puzzle_id"],
                eco_code=p.get("eco_code"),
                move_number=p.get("move_number"),
                mistake_type=p.get("mistake_type"),
                source_report_id=p.get("source_report_id"),
            )
            for p in puzzles_data
            if p.get("puzzle_id")
        ]
        pool = await get_pool()
        rep = await UserRepertoireService.create_repertoire(
            pool,
            user_id,
            name,
            rep_type,
            color,
            openings_models,
            puzzles_models,
            time_control,
        )
        return rep.dict()
    except Exception as e:
        logger.info(f"Error creating repertoire: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create repertoire")


@app.patch("/api/repertoires/{repertoire_id}")
async def update_user_repertoire(repertoire_id: str, request: Request):
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required for user repertoires")
    body = await request.json()
    name = body.get("name")
    color = body.get("color")
    try:
        pool = await get_pool()
        rep = await UserRepertoireService.update_repertoire(pool, user_id, repertoire_id, name=name, color=color)
        if not rep:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        return rep.dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error updating repertoire {repertoire_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update repertoire")


@app.put("/api/repertoires/{repertoire_id}/openings")
async def set_repertoire_openings(repertoire_id: str, request: Request):
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required for user repertoires")
    body = await request.json()
    openings_data = body.get("openings", [])
    try:
        openings_models = [
            gateway_modules.models.repertoire.RepertoireBucketOpening(
                eco_code=o["eco_code"],
                color=o["color"],
                note=o.get("note")
            )
            for o in openings_data if o.get("eco_code") and o.get("color")
        ]
        pool = await get_pool()
        rep = await UserRepertoireService.set_repertoire_openings(pool, user_id, repertoire_id, openings_models)
        if not rep:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        return rep.dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error setting openings for repertoire {repertoire_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to set repertoire openings")


@app.delete("/api/repertoires/{repertoire_id}")
async def delete_user_repertoire(repertoire_id: str, request: Request):
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required for user repertoires")
    try:
        pool = await get_pool()
        deleted = await UserRepertoireService.delete_repertoire(pool, user_id, repertoire_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error deleting repertoire {repertoire_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete repertoire")


# ========================================
# ADD OPENINGS TO REPERTOIRE ENDPOINTS
# ========================================
from gateway_modules.services.add_openings_service import (
    add_openings_from_repertoire,
    add_openings_from_catalog,
    get_openings_for_import,
)


@app.get("/api/repertoires/{repertoire_id}/openings-for-import")
async def get_repertoire_openings_for_import(repertoire_id: str, request: Request):
    """
    Get openings from a repertoire bucket for the import selection UI.
    Used to populate the source bucket dropdown in Add Opening modal.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        pool = await get_pool()
        openings = await get_openings_for_import(pool, user_id, repertoire_id)
        return {"openings": openings}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.info(f"Error getting openings for import from {repertoire_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get openings")


class AddOpeningsFromRepertoireRequest(BaseModel):
    source_repertoire_id: str
    eco_codes: List[str]


@app.post("/api/repertoires/{repertoire_id}/add-openings-from-repertoire")
async def add_openings_from_repertoire_endpoint(
    repertoire_id: str,
    request: Request,
    body: AddOpeningsFromRepertoireRequest
):
    """
    Copy selected openings from a source repertoire to the target repertoire.
    Both repertoires must be owned by the same user.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        pool = await get_pool()
        result = await add_openings_from_repertoire(
            pool,
            user_id,
            repertoire_id,
            body.source_repertoire_id,
            body.eco_codes
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.info(f"Error adding openings from repertoire: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add openings")


class CatalogOpening(BaseModel):
    eco: str
    name: str = ""
    color: str  # "white" or "black"


class AddOpeningsFromCatalogRequest(BaseModel):
    openings: List[CatalogOpening]


@app.post("/api/repertoires/{repertoire_id}/add-openings-from-catalog")
async def add_openings_from_catalog_endpoint(
    repertoire_id: str,
    request: Request,
    body: AddOpeningsFromCatalogRequest
):
    """
    Add openings from the ECO catalog to a repertoire bucket.
    Openings are copied with provenance metadata.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        pool = await get_pool()
        # Convert Pydantic models to dicts
        catalog_openings = [op.dict() for op in body.openings]
        result = await add_openings_from_catalog(
            pool,
            user_id,
            repertoire_id,
            catalog_openings
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.info(f"Error adding openings from catalog: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add openings")


ECO_SERVICE_URL = os.getenv("ECO_SERVICE_URL", "http://eco:5000")


@app.get("/api/opening-catalog/search")
async def search_opening_catalog(
    q: str = Query("", description="Search query (opening name, ECO code, or moves)"),
    side: str = Query("", description="Filter by side: white or black"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return")
):
    """
    Search the ECO opening catalog.
    Proxies to the eco-service /search endpoint.
    """
    if not q.strip():
        return {"openings": [], "count": 0}
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Use eco-service search endpoint
            response = await client.post(
                f"{ECO_SERVICE_URL}/search",
                json={"query": q.strip()}
            )
            response.raise_for_status()
            data = response.json()
            
            matches = data.get("matches", [])
            
            # Filter by side if specified (eco-service doesn't support this directly)
            # For now, we return all matches - side filtering happens on frontend
            # Limited to requested limit
            return {
                "openings": matches[:limit],
                "count": min(len(matches), limit)
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="ECO service timeout")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"ECO service error: {e.response.status_code}")
    except Exception as e:
        logger.info(f"Error searching opening catalog: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search opening catalog")

# Reports and activity heatmap endpoints moved to gateway_modules/routers/reports.py



# ---------------------------------------------------------------------------
# Game Analysis Endpoint (Accuracy & Elo Estimation)
# ---------------------------------------------------------------------------

from gateway_modules.services.accuracy_calculation_service import calculate_game_accuracy
from gateway_modules.services.elo_estimation_service import estimate_game_elo
from gateway_modules.services.game_review_service import build_move_review_annotations


class GameAnalysisRequest(BaseModel):
    pgn: str
    white_elo: Optional[int] = None
    black_elo: Optional[int] = None
    depth: int = 12


@app.post("/analysis/game")
async def analyze_game_accuracy_elo(request_body: GameAnalysisRequest):
    """
    Analyze a game for accuracy metrics and Elo estimation.

    This endpoint analyzes ALL moves (both players) using Stockfish evaluation
    and returns:
    - Move-by-move analysis with evaluations
    - Lichess-style accuracy for both players
    - CPL-based Elo estimation for both players

    Args:
        pgn: PGN string of the game
        white_elo: Known white player rating (optional, for adjusted estimate)
        black_elo: Known black player rating (optional, for adjusted estimate)
        depth: Stockfish analysis depth (default 12, range 8-18)

    Returns:
        {
            "move_analyses": [...],
            "accuracy_metrics": {"white": float, "black": float},
            "elo_estimates": {
                "white": {"estimated": int, "adjusted": int, "known_rating": int},
                "black": {"estimated": int, "adjusted": int, "known_rating": int}
            }
        }
    """
    import chess
    import chess.pgn
    from io import StringIO

    pgn = request_body.pgn.strip()
    if not pgn:
        raise HTTPException(status_code=400, detail="PGN is required")

    depth = max(8, min(18, request_body.depth))

    try:
        # Parse PGN
        pgn_io = StringIO(pgn)
        chess_game = chess.pgn.read_game(pgn_io)

        if chess_game is None:
            raise HTTPException(status_code=400, detail="Invalid PGN format")

        # Build board and analyze all moves
        board = chess.Board()
        move_analyses = []
        ply = 0
        prev_eval = {"cp": 0, "mate": None}  # Starting position is equal

        pool = await get_pool()
        
        # DIAGNOSTIC: Track engine calls
        engine_call_count = 0
        diagnostic_logs = []

        for node in chess_game.mainline():
            move = node.move
            ply += 1

            # Get FEN before move
            fen_before = board.fen()
            san_move = board.san(move)

            # Make move
            board.push(move)
            fen_after = board.fen()

            # Use MultiPV to evaluate multiple moves in one analysis
            # This lets us find the score for the played move AND the best move
            # from the same analysis, eliminating variance between separate calls
            async with httpx.AsyncClient(timeout=30.0) as client:
                try:
                    # Analyze position BEFORE move with MultiPV to find played move's rank
                    r_analysis = await client.post(
                        f"{STOCKFISH_URL}/analyze",
                        json={"fen": fen_before, "depth": depth, "multipv": 5}
                    )
                    r_analysis.raise_for_status()
                    analysis_data = r_analysis.json()
                    engine_call_count += 1
                    
                    # Extract best move's score and find played move's score
                    best_eval_cp = analysis_data.get("best_score", 0)
                    best_move_uci = None
                    played_move_score = None
                    move_uci = move.uci()  # Get the UCI of the played move
                    
                    if analysis_data.get("analysis"):
                        best_move_uci = analysis_data["analysis"][0].get("uci")
                        
                        # Find the played move in the MultiPV results
                        for mv_data in analysis_data["analysis"]:
                            if mv_data.get("uci") == move_uci:
                                played_move_score = mv_data.get("score")
                                break
                    
                    # If played move wasn't in top N, we need a separate analysis after the move
                    if played_move_score is None:
                        r_after = await client.post(
                            f"{STOCKFISH_URL}/analyze",
                            json={"fen": fen_after, "depth": depth}
                        )
                        r_after.raise_for_status()
                        eval_data = r_after.json()
                        engine_call_count += 1
                        
                        # For the played move's eval, we need to negate if it's from opponent's perspective
                        # Stockfish always returns from side-to-move's perspective... wait no, from White's
                        eval_after_cp = eval_data.get("cp", 0)
                    else:
                        # Use the score from MultiPV directly
                        eval_after_cp = played_move_score
                        eval_data = {"cp": played_move_score, "depth": depth, "mate": None}
                    
                    # DIAGNOSTIC: Log raw engine response
                    diagnostic_logs.append({
                        "move_index": ply,
                        "fen_before": fen_before,
                        "played_move": san_move,
                        "played_move_uci": move_uci,
                        "engine_best_move": best_move_uci or "MISSING",
                        "eval_before_cp": prev_eval.get("cp"),
                        "best_eval_cp": best_eval_cp,
                        "played_move_score": played_move_score,
                        "eval_after_cp": eval_after_cp,
                        "move_found_in_multipv": played_move_score is not None,
                    })
                    
                except Exception as e:
                    logger.info(f"Stockfish error at ply {ply}: {e}")
                    # DIAGNOSTIC: Hard fail instead of silent fallback
                    raise RuntimeError(f"DIAGNOSTIC: Missing eval at move {ply} - {e}")

            # Build move analysis with both evals for CPL calculation
            move_analysis = {
                "ply": ply,
                "move": san_move,
                "fen_before": fen_before,
                "fen_after": fen_after,
                "eval": {
                    "cp": eval_after_cp,
                    "depth": depth,
                    "mate": eval_data.get("mate") if isinstance(eval_data, dict) else None
                },
                "prev_eval": prev_eval.copy(),
                "best_eval": {
                    "cp": best_eval_cp,  # Expected eval if best move was played
                    "mate": analysis_data.get("mate")
                },
                "best_move": best_move_uci or "",
                "pv": analysis_data.get("pv", [])
            }

            move_analyses.append(move_analysis)

            # Update previous eval for next move
            prev_eval = {
                "cp": eval_data.get("cp", 0),
                "mate": eval_data.get("mate")
            }

        # DIAGNOSTIC: Verify engine was called for each move
        total_moves = len(move_analyses)
        logger.info(f"[DIAGNOSTIC] Engine calls: {engine_call_count}, Total moves: {total_moves}")
        
        # DIAGNOSTIC: Log first 5 moves for inspection
        logger.info(f"[DIAGNOSTIC] First 5 move evals:")
        for i, log in enumerate(diagnostic_logs[:5]):
            logger.info(f"  Move {log['move_index']}: {log['played_move']}, "
                  f"eval_before={log['eval_before_cp']}, eval_after={log.get('eval_after_cp', 'N/A')}, "
                  f"best_move={log['engine_best_move']}, in_multipv={log.get('move_found_in_multipv', 'N/A')}")
        
        # DIAGNOSTIC: Check if evals are all the same
        all_evals = [m["eval"]["cp"] for m in move_analyses]
        unique_evals = set(all_evals)
        logger.info(f"[DIAGNOSTIC] Unique eval values: {len(unique_evals)} - Sample: {list(unique_evals)[:10]}")
        
        if len(unique_evals) == 1:
            logger.info(f"[DIAGNOSTIC] WARNING: All evals are identical ({all_evals[0]}cp) - engine may be broken!")

        # Calculate accuracy metrics
        accuracy_metrics = calculate_game_accuracy(move_analyses)
        logger.info(f"[DIAGNOSTIC] Accuracy: white={accuracy_metrics.get('white')}, black={accuracy_metrics.get('black')}")

        # Calculate Elo estimates
        elo_estimates = estimate_game_elo(
            move_analyses,
            white_elo=request_body.white_elo,
            black_elo=request_body.black_elo
        )

        # Build engine annotations for game review UI
        engine_annotations = build_move_review_annotations(move_analyses)
        
        # DIAGNOSTIC: Log classification distribution
        classification_counts = {}
        for ann in engine_annotations:
            mt = ann.get("mistake_type", "none")
            classification_counts[mt] = classification_counts.get(mt, 0) + 1
        logger.info(f"[DIAGNOSTIC] Classification distribution: {classification_counts}")
        
        # DIAGNOSTIC: Log cp_loss for first 5 annotations
        logger.info(f"[DIAGNOSTIC] First 5 annotation eval_deltas:")
        for ann in engine_annotations[:5]:
            logger.info(f"  Ply {ann.get('ply_index')}: move={ann.get('move_san')}, "
                  f"eval_delta={ann.get('eval_delta')}, classification={ann.get('mistake_type')}")

        return {
            "move_analyses": move_analyses,
            "accuracy_metrics": accuracy_metrics,
            "elo_estimates": elo_estimates,
            "engine_annotations": engine_annotations,
            # DIAGNOSTIC: Include diagnostic data in response
            "_diagnostic": {
                "engine_call_count": engine_call_count,
                "total_moves": total_moves,
                "unique_eval_count": len(unique_evals),
                "sample_evals": all_evals[:10],
                "classification_distribution": classification_counts
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error analyzing game: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze game: {str(e)}")


# Home dashboard, ratings graph endpoints moved to gateway_modules/routers/home.py


# ==============================================================================
# Personal Trainer Endpoints
# ==============================================================================

from gateway_modules.services.memory.memory_snapshot_service import (
    get_memory_snapshot,
    rebuild_memory_snapshot,
    should_rebuild_snapshot,
    get_user_game_count,
    select_key_positions_for_training,
    MIN_GAMES_FOR_SNAPSHOT
)


@app.get("/api/me/trainer/summary")
async def get_trainer_summary(
    request: Request,
    time_control: str = Query("all", description="Time control: bullet, blitz, rapid, classical, all, or auto"),
    side: str = Query("both", description="Side: white, black, or both"),
    pool: asyncpg.Pool = Depends(get_pool)
):
    """
    Get the trainer summary for the current user.
    
    This is the main endpoint for the Personal Trainer dashboard.
    Returns coaching summary, statistics, and recommendations.
    
    No text input from user - this is a read-only endpoint.
    """
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Handle 'auto' time control - default to 'all' or most-played
    if time_control == "auto":
        time_control = "all"
    
    # Validate time_control and side
    valid_time_controls = ["bullet", "blitz", "rapid", "classical", "all"]
    valid_sides = ["white", "black", "both"]
    
    if time_control not in valid_time_controls:
        raise HTTPException(status_code=400, detail=f"Invalid time_control. Must be one of: {valid_time_controls}")
    if side not in valid_sides:
        raise HTTPException(status_code=400, detail=f"Invalid side. Must be one of: {valid_sides}")
    
    try:
        # Check if we have enough games
        game_count = await get_user_game_count(pool, user_id, time_control, side)
        
        if game_count < MIN_GAMES_FOR_SNAPSHOT:
            return {
                "status": "not_enough_games",
                "time_control": time_control,
                "side": side,
                "sample_size": game_count,
                "message": f"Play at least {MIN_GAMES_FOR_SNAPSHOT} games to unlock personal trainer insights.",
                "raw_stats": {},
                "coach_summary": None,
                "recommendations": {},
                "updated_at": None,
                "persistent_trainer": None,
            }
        
        # Try to get existing snapshot
        snapshot = await get_memory_snapshot(pool, user_id, time_control, side)
        
        if snapshot:
            # Check if we should rebuild
            needs_rebuild = await should_rebuild_snapshot(pool, user_id, time_control, side)
            
            if needs_rebuild:
                # Rebuild in background (async task would be better, but inline for now)
                asyncio.create_task(rebuild_memory_snapshot(pool, user_id, time_control, side))
                
            # Get persistent trainer data if enabled
            persistent_trainer_data = None
            try:
                from gateway_modules.services.memory.config import ENABLE_PERSISTENT_TRAINER
                if ENABLE_PERSISTENT_TRAINER:
                    from gateway_modules.services.memory.trainer_events import (
                        get_cached_trainer_snapshot,
                        verbalize_events_sync
                    )
                    trainer_snapshot = get_cached_trainer_snapshot(user_id, time_control, side)
                    if trainer_snapshot:
                        persistent_trainer_data = {
                            "progress_since_last": trainer_snapshot.derived_deltas,
                            "detected_events": [e.to_dict() for e in trainer_snapshot.events],
                            "event_summary": verbalize_events_sync(trainer_snapshot.events),
                            "derived_metrics": trainer_snapshot.derived_metrics.to_dict(),
                            "snapshot_period": trainer_snapshot.period,
                        }
            except Exception as e:
                logger.info(f"Failed to get persistent trainer data: {e}")
                
            return {
                "status": "ready" if not needs_rebuild else "updating",
                "time_control": time_control,
                "side": side,
                "sample_size": snapshot["sample_size"],
                "raw_stats": snapshot["raw_stats"],
                "coach_summary": snapshot["coach_summary"],
                "recommendations": snapshot["recommendations"],
                "updated_at": snapshot["updated_at"],
                "persistent_trainer": persistent_trainer_data,
            }
        else:
            # No snapshot exists, start building one
            asyncio.create_task(rebuild_memory_snapshot(pool, user_id, time_control, side))
            
            return {
                "status": "building",
                "time_control": time_control,
                "side": side,
                "sample_size": game_count,
                "message": "Building your personal training profile from recent games...",
                "raw_stats": {},
                "coach_summary": None,
                "recommendations": {},
                "updated_at": None,
                "persistent_trainer": None,
            }
            
    except Exception as e:
        logger.info(f"Error getting trainer summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to get trainer summary")


class TrainerRefreshRequest(BaseModel):
    time_control: str = "all"
    side: str = "both"


@app.post("/api/me/trainer/refresh")
async def refresh_trainer(
    request: Request,
    body: TrainerRefreshRequest = None,
    pool: asyncpg.Pool = Depends(get_pool)
):
    """
    Manually trigger a trainer refresh from recent games.
    
    Only rebuilds if there are new games since the last rebuild.
    """
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    time_control = body.time_control if body else "all"
    side = body.side if body else "both"
    
    try:
        needs_rebuild = await should_rebuild_snapshot(pool, user_id, time_control, side)
        
        if needs_rebuild:
            # Trigger rebuild
            asyncio.create_task(rebuild_memory_snapshot(pool, user_id, time_control, side))
            return {"status": "queued", "message": "Refreshing trainer from recent games..."}
        else:
            return {"status": "no_changes", "message": "No new games to process since last refresh."}
            
    except Exception as e:
        logger.info(f"Error refreshing trainer: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh trainer")


@app.get("/api/me/trainer/puzzles")
async def get_trainer_puzzles(
    request: Request,
    time_control: str = Query("all", description="Time control filter"),
    side: str = Query("both", description="Side filter"),
    limit: int = Query(10, ge=1, le=50, description="Number of puzzles"),
    pool: asyncpg.Pool = Depends(get_pool)
):
    """
    Get personalized puzzles from the user's own games.
    
    These are positions where the user made mistakes, selected 
    based on the trainer's analysis of their weaknesses.
    """
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Get snapshot for recommendations
        snapshot = await get_memory_snapshot(pool, user_id, time_control, side)
        
        if not snapshot:
            return {"puzzles": [], "message": "No trainer data available yet."}
        
        # Get puzzle recommendations from snapshot
        recommendations = snapshot.get("recommendations", {})
        puzzle_refs = recommendations.get("puzzles", [])[:limit]
        
        # Fetch full puzzle data from key_positions
        puzzles = []
        key_positions = await select_key_positions_for_training(pool, user_id, time_control, side, limit)
        
        # Build position ID -> position map
        pos_map = {pos["position_id"]: pos for pos in key_positions}
        
        for ref in puzzle_refs:
            pos_id = ref.get("position_id")
            if pos_id and pos_id in pos_map:
                pos = pos_map[pos_id]
                puzzles.append({
                    "position_id": pos_id,
                    "fen": pos["fen_before"],
                    "side_to_move": pos["side_to_move"],
                    "theme": ref.get("theme", pos["tags"][0] if pos.get("tags") else "tactical"),
                    "priority": ref.get("priority", "medium"),
                    "reason": ref.get("reason", ""),
                    "best_move": pos.get("best_move_san", ""),
                    "game_id": pos.get("game_id"),
                    "move_number": pos.get("move_number")
                })
        
        # If we don't have puzzle refs from LLM recommendations, fall back to key positions
        if not puzzles and key_positions:
            for pos in key_positions[:limit]:
                puzzles.append({
                    "position_id": pos["position_id"],
                    "fen": pos["fen_before"],
                    "side_to_move": pos["side_to_move"],
                    "theme": pos["tags"][0] if pos.get("tags") else "tactical",
                    "priority": "high" if pos.get("eval_loss_cp", 0) < -200 else "medium",
                    "reason": f"Critical {pos['phase']} position with significant eval loss",
                    "best_move": pos.get("best_move_san", ""),
                    "game_id": pos.get("game_id"),
                    "move_number": pos.get("move_number")
                })
        
        return {"puzzles": puzzles}
        
    except Exception as e:
        logger.info(f"Error getting trainer puzzles: {e}")
        raise HTTPException(status_code=500, detail="Failed to get trainer puzzles")


@app.get("/api/me/trainer/pv-lines")
async def get_trainer_pv_lines(
    request: Request,
    time_control: str = Query("all", description="Time control filter"),
    side: str = Query("both", description="Side filter"),
    limit: int = Query(10, ge=1, le=50, description="Number of PV lines"),
    pool: asyncpg.Pool = Depends(get_pool)
):
    """
    Get PV lines from the user's own games for study.
    
    These are critical positions with engine analysis lines
    that the user should study to improve.
    """
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Get snapshot for recommendations
        snapshot = await get_memory_snapshot(pool, user_id, time_control, side)
        
        if not snapshot:
            return {"pv_lines": [], "message": "No trainer data available yet."}
        
        # Get PV line recommendations from snapshot
        recommendations = snapshot.get("recommendations", {})
        pv_refs = recommendations.get("pv_lines", [])[:limit]
        
        # Fetch full position data
        key_positions = await select_key_positions_for_training(pool, user_id, time_control, side, limit)
        
        # Build position ID -> position map
        pos_map = {pos["position_id"]: pos for pos in key_positions}
        
        pv_lines = []
        for ref in pv_refs:
            pos_id = ref.get("position_id")
            if pos_id and pos_id in pos_map:
                pos = pos_map[pos_id]
                if pos.get("pv_san"):  # Only include if we have a PV line
                    pv_lines.append({
                        "position_id": pos_id,
                        "fen": pos["fen_before"],
                        "side_to_move": pos["side_to_move"],
                        "pv_san": pos["pv_san"],
                        "display_name": ref.get("display_name", f"{pos['phase'].title()} improvement"),
                        "reason": ref.get("reason", ""),
                        "study_hint": ref.get("study_hint", "Focus on understanding the key moves."),
                        "game_id": pos.get("game_id"),
                        "move_number": pos.get("move_number")
                    })
        
        # Fallback to key positions if no refs
        if not pv_lines and key_positions:
            for pos in key_positions[:limit]:
                if pos.get("pv_san"):
                    pv_lines.append({
                        "position_id": pos["position_id"],
                        "fen": pos["fen_before"],
                        "side_to_move": pos["side_to_move"],
                        "pv_san": pos["pv_san"],
                        "display_name": f"{pos['phase'].title()} position study",
                        "reason": f"Learn the best continuation from this {pos['phase']} position",
                        "study_hint": "Compare your move with the engine's recommendation.",
                        "game_id": pos.get("game_id"),
                        "move_number": pos.get("move_number")
                    })
        
        return {"pv_lines": pv_lines}
        
    except Exception as e:
        logger.info(f"Error getting trainer PV lines: {e}")
        raise HTTPException(status_code=500, detail="Failed to get trainer PV lines")


# =============================================================================
# POSITION EVALUATION ENDPOINT (Heuristic-based)
# =============================================================================

class PositionEvalRequest(BaseModel):
    fen: str
    heuristics: Optional[Dict[str, Any]] = None  # Optional: auto-calculated if not provided
    ply_count: Optional[int] = None  # Number of plies (half-moves) played
    eco_code: Optional[str] = None  # ECO code for opening identification
    eco_name: Optional[str] = None  # Opening name
    # NEW: Context for narrator (optional)
    pre_move_fen: Optional[str] = None
    move_san: Optional[str] = None


@app.post("/api/analysis/position-eval")
async def evaluate_position_heuristics(request_body: PositionEvalRequest):
    """
    Evaluate a position using heuristic scoring (no engine, no LLM).
    
    This endpoint provides fast positional evaluation based on tactical
    and positional heuristics, returning a tier-based assessment with
    human-readable commentary.
    
    Args:
        fen: FEN string of the position
        heuristics: Optional heuristics dictionary. If not provided, auto-calculated.
        ply_count: Optional number of plies played. If 0, returns disabled commentary.
        eco_code: Optional ECO code for opening identification.
        eco_name: Optional opening name for ECO-aware commentary.
    
    Returns:
        {
            "advantage": tier_string (e.g., "white_slightly_better"),
            "commentary": human_readable_text,
            "white_score": number,
            "black_score": number,
            "eval": number,
            "verdict": verdict_string,
            "summary": one_line_summary,
            "meta": {...},
            "disabled": boolean (optional, true if commentary should be hidden)
        }
    """
    from gateway_modules.services.position_evaluation_service import (
        evaluate_position_from_heuristics
    )
    from gateway_modules.services.heuristics_service import (
        calculate_position_heuristics
    )
    
    try:
        # Guard for initial position - return disabled commentary
        if request_body.ply_count is not None and request_body.ply_count == 0:
            return {
                "advantage": "equal",
                "commentary": "Game start — No moves played yet.",
                "white_score": 0,
                "black_score": 0,
                "eval": 0,
                "verdict": "equal",
                "summary": "Game start",
                "meta": {
                    "game_phase": "opening",
                    "castling_info": {},
                    "attacks_and_threats": {},
                    "eco": None
                },
                "disabled": True
            }
        
        # Calculate heuristics if not provided
        heuristics = request_body.heuristics
        if heuristics is None:
            heuristics = calculate_position_heuristics(
                request_body.fen,
                ply_count=request_body.ply_count
            )
        
        # Determine side to move from FEN
        fen_parts = request_body.fen.split()
        white_to_move = len(fen_parts) < 2 or fen_parts[1] == "w"
        
        result = evaluate_position_from_heuristics(
            heuristics=heuristics,
            white_to_move=white_to_move,
            fen=request_body.fen,
            ply_count=request_body.ply_count,
            eco_code=request_body.eco_code,
            eco_name=request_body.eco_name,
            pre_move_fen=request_body.pre_move_fen,
            move_san=request_body.move_san
        )
        
        return result
        
    except Exception as e:
        logger.info(f"Error evaluating position: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to evaluate position: {str(e)}")


# =============================================================================
# SHARE CLIPS API ENDPOINTS (Virality Feature)
# =============================================================================

from gateway_modules.services.share_clips_service import (
    ShareClipsService,
    generate_unique_slug,
    build_render_payload
)


class CreateShareClipRequest(BaseModel):
    primary_move_index: Optional[int] = None
    show_threat_arrows: bool = True
    show_move_classification: bool = True


@app.post("/api/me/gamereview/{analysis_id}/share")
async def create_share_clip(
    analysis_id: str,
    request: Request,
    body: CreateShareClipRequest
):
    """
    Create a shareable clip for a game review move.
    
    Uses existing analysis data - NO new LLM or engine computations.
    
    Args:
        analysis_id: ID of the saved report or game analysis
        primary_move_index: Move to feature (optional, auto-picks if omitted)
        show_threat_arrows: Whether to show threat arrows in rendered clip
        show_move_classification: Whether to show classification badge
    
    Returns:
        Share clip metadata with preview data and share URL
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    
    try:
        # Fetch the analysis/report
        # Try to get from saved_reports first
        async with pool.acquire() as conn:
            report_row = await conn.fetchrow(
                "SELECT id, report_data FROM saved_reports WHERE id = $1 AND user_id = $2",
                analysis_id,
                user_id
            )
        
        if not report_row:
            raise HTTPException(status_code=404, detail="Analysis not found or not owned by user")
        
        # Parse report data
        import json
        report_data = json.loads(report_row["report_data"]) if isinstance(report_row["report_data"], str) else report_row["report_data"]
        
        # Get engine analysis moves if available
        engine_analysis = report_data.get("engine_analysis", {})
        moves = engine_analysis.get("moves", [])
        
        # Determine primary move index (auto-pick if not provided)
        primary_move_index = body.primary_move_index
        if primary_move_index is None:
            primary_move_index = _pick_headline_move(moves)
        
        # Validate move index
        if not moves or primary_move_index < 0 or primary_move_index >= len(moves):
            # Fallback: use index 0 or just generate with minimal data
            primary_move_index = 0 if moves else 0
        
        # Build move data from existing analysis
        if moves and primary_move_index < len(moves):
            move = moves[primary_move_index]
            move_data = {
                "fen": move.get("fen_after", move.get("fen_before", "")),
                "san": move.get("move", ""),
                "eval_cp_before": move.get("eval", {}).get("cp", 0) if primary_move_index == 0 
                                   else moves[primary_move_index - 1].get("eval", {}).get("cp", 0),
                "eval_cp_after": move.get("eval", {}).get("cp", 0),
                "classification": move.get("mistake_type"),
                "commentary": "",  # Can be populated from insights if available
                "threat_arrows": []  # Would come from computed threats if stored
            }
        else:
            move_data = {"san": "...", "fen": "", "classification": None}
        
        # Get classification label for slug
        classification = move_data.get("classification")
        san = move_data.get("san", "move")
        
        # Generate unique slug
        slug = generate_unique_slug(san, classification, primary_move_index)
        
        # Build game metadata
        game_meta = {
            "opponent": report_data.get("name", "Unknown"),
            "result": "?",
            "time_control": report_data.get("time_control_filter", ""),
            "played_at": report_data.get("analysis_date", ""),
            "opening_name": ""
        }
        
        # Build render payload
        visual_options = {
            "show_threat_arrows": body.show_threat_arrows,
            "show_move_classification": body.show_move_classification
        }
        
        render_payload = build_render_payload(
            analysis_id=analysis_id,
            game_id=None,  # Not linked to games table for reports
            primary_move_index=primary_move_index,
            move_data=move_data,
            game_meta=game_meta,
            visual_options=visual_options
        )
        
        # Create share clip record
        clip = await ShareClipsService.create_clip(
            pool=pool,
            user_id=user_id,
            game_id=None,
            analysis_id=analysis_id,
            primary_move_index=primary_move_index,
            slug=slug,
            show_threat_arrows=body.show_threat_arrows,
            show_move_classification=body.show_move_classification,
            render_payload=render_payload
        )
        
        # Build response
        base_url = os.getenv("BASE_URL", "https://sprintchess.com")
        
        return {
            "id": clip["id"],
            "slug": slug,
            "share_url": f"{base_url}/share/{slug}",
            "status": "pending_render",
            "gif_url": None,
            "thumbnail_url": None,
            "primary_move_index": primary_move_index,
            "show_threat_arrows": body.show_threat_arrows,
            "show_move_classification": body.show_move_classification,
            "preview": {
                "san": move_data.get("san", ""),
                "classification": move_data.get("classification"),
                "commentary": move_data.get("commentary", ""),
                "eval_cp_before": move_data.get("eval_cp_before", 0),
                "eval_cp_after": move_data.get("eval_cp_after", 0)
            },
            "game_meta": game_meta
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error creating share clip: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create share clip: {str(e)}")


def _pick_headline_move(moves: list) -> int:
    """
    Auto-pick the most interesting move for the headline.
    
    Priority:
    1. Move with largest eval swing (blunder/brilliant)
    2. Move labeled as blunder/brilliant/critical
    3. First mistake
    4. Default to move 10 (middle game)
    
    Args:
        moves: List of move analysis dicts
    
    Returns:
        Index of the headline move
    """
    if not moves:
        return 0
    
    best_idx = 0
    best_swing = 0
    
    for i, move in enumerate(moves):
        # Check for labeled moves first
        mistake_type = move.get("mistake_type", "")
        if mistake_type in ("brilliant", "blunder"):
            return i
        
        # Calculate eval swing
        eval_data = move.get("eval", {})
        current_cp = eval_data.get("cp", 0)
        
        if i > 0:
            prev_cp = moves[i - 1].get("eval", {}).get("cp", 0)
            swing = abs(current_cp - prev_cp)
            if swing > best_swing:
                best_swing = swing
                best_idx = i
    
    # If no significant swing found, use mid-game move
    if best_swing < 50 and len(moves) > 10:
        return min(10, len(moves) - 1)
    
    return best_idx


@app.get("/api/me/share_clips/{clip_id}")
async def get_share_clip_by_id(clip_id: str, request: Request):
    """
    Get a share clip by ID for the owner.
    
    Returns full clip data including render status.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    
    clip = await ShareClipsService.get_clip_by_id(pool, clip_id, user_id=user_id)
    
    if not clip:
        raise HTTPException(status_code=404, detail="Share clip not found")
    
    base_url = os.getenv("BASE_URL", "https://sprintchess.com")
    
    # Determine status based on gif_url presence
    status = "ready" if clip.get("gif_url") else "pending_render"
    
    return {
        "id": clip["id"],
        "slug": clip["slug"],
        "share_url": f"{base_url}/share/{clip['slug']}",
        "status": status,
        "gif_url": clip.get("gif_url"),
        "thumbnail_url": clip.get("thumbnail_url"),
        "primary_move_index": clip["primary_move_index"],
        "show_threat_arrows": clip["show_threat_arrows"],
        "show_move_classification": clip["show_move_classification"],
        "created_at": clip["created_at"],
        "updated_at": clip["updated_at"]
    }


@app.get("/api/share/{slug}")
async def get_public_share_clip(slug: str):
    """
    Get a public share clip by slug (no auth required).
    
    Returns 404 if clip not found or not public.
    """
    pool = await get_pool()
    
    clip = await ShareClipsService.get_clip_by_slug(pool, slug, public_only=True)
    
    if not clip:
        raise HTTPException(status_code=404, detail="Share clip not found or not public")
    
    # Parse render payload for display data
    render_payload = clip.get("render_payload", {}) or {}
    frame = render_payload.get("frame", {})
    game_meta = render_payload.get("game_meta", {})
    
    # Build title from move data
    san = frame.get("san", "Move")
    classification = frame.get("classification", "")
    title = f"{classification.title()} {san}!" if classification else f"{san} from SprintChess analysis"
    
    return {
        "slug": slug,
        "gif_url": clip.get("gif_url"),
        "thumbnail_url": clip.get("thumbnail_url"),
        "title": title,
        "short_description": frame.get("commentary", ""),
        "game_meta": game_meta,
        "primary_move_index": clip["primary_move_index"],
        "show_threat_arrows": clip["show_threat_arrows"],
        "show_move_classification": clip["show_move_classification"],
        "frame": {
            "fen": frame.get("fen", ""),
            "san": san,
            "classification": classification,
            "eval_cp_before": frame.get("eval_cp_before", 0),
            "eval_cp_after": frame.get("eval_cp_after", 0)
        }
    }


# =============================================================================
# PERSONAL TRAINER UI-READY ENDPOINTS
# =============================================================================

@app.get("/api/me/trainer/status")
async def get_trainer_status(request: Request):
    """Get current trainer state and linked account info."""
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT state, linked_account_id, last_daily_sync_at, last_deep_update_at FROM trainer_state WHERE user_id = $1",
        UUID(user_id)
    )
    
    if not row:
        return {"state": "NO_ACCOUNT", "linked_account_id": None}
    
    return dict(row)

@app.get("/api/me/trainer/reports")
async def get_trainer_reports(request: Request):
    """Get all active trainer reports for the user."""
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, time_control, summary_metrics, is_bootstrap, created_at FROM trainer_reports WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC",
        UUID(user_id)
    )
    return [dict(r) for r in rows]

@app.get("/api/me/trainer/daily")
async def get_latest_daily_commentary(request: Request):
    """Get the latest daily coaching commentary."""
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT report_date, commentary_text, game_ids_analyzed, concepts_detected FROM trainer_daily_commentary WHERE user_id = $1 ORDER BY report_date DESC LIMIT 1",
        UUID(user_id)
    )
    return dict(row) if row else None

@app.get("/api/me/trainer/snapshot")
async def get_latest_trainer_snapshot(request: Request):
    """Get the latest deep trainer snapshot/pattern analysis."""
    user_id, _ = get_owner_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT narrative_focus, long_term_patterns, lc0_insights, created_at FROM trainer_snapshots WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        UUID(user_id)
    )
    return dict(row) if row else None
