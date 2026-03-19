import json
import os
import time
import logging
from typing import List, Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from redis import asyncio as aioredis

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
    instrument_asyncpg_pool,
)

init_observability("puzzle")

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
PUZZLE_CACHE_TTL = int(os.getenv("PUZZLE_CACHE_TTL", "300"))

# Initialize Sentry
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
    )


class Attempt(BaseModel):
    user_id: str
    puzzle_id: str
    correct: bool
    time_spent: float


class Puzzle(BaseModel):
    id: str
    fen: str
    moves: List[str]
    rating: Optional[int] = None
    themes: Optional[List[str]] = None
    opening_tags: Optional[List[str]] = None
    eco: Optional[str] = None
    opening: Optional[str] = None
    variation: Optional[str] = None


def _require_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable must be set for puzzle-service")

    # DNS Fallback for local development environment issues
    import socket
    try:
        socket.gethostbyname("postgres")
    except socket.gaierror:
        # Fallback to known IP if DNS fails (common in this specific docker environment)
        if "@postgres" in database_url:
            database_url = database_url.replace("@postgres", "@172.18.0.3")

    return database_url


def _cache_key(mode: str, rating: int, themes: Optional[List[str]], ecos: Optional[List[str]]) -> str:
    payload = {
        "mode": mode,
        "rating": rating,
        "themes": sorted(themes or []),
        "ecos": sorted(ecos or []),
    }
    return f"puzzle::{json.dumps(payload, sort_keys=True)}"


async def cache_puzzle(redis_client, key: str, puzzle: dict) -> None:
    await redis_client.set(key, json.dumps(puzzle), ex=PUZZLE_CACHE_TTL)


async def get_cached_puzzle(redis_client, key: str) -> Optional[dict]:
    raw = await redis_client.get(key)
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    return None


def update_rating(user_rating: int, puzzle_rating: int, correct: bool) -> int:
    k = 20
    expected = 1 / (1 + 10 ** ((puzzle_rating - user_rating) / 400))
    delta = (1 if correct else 0) - expected
    return max(400, round(user_rating + k * delta))


def _row_to_dict(row: asyncpg.Record) -> dict:
    data = {}
    for key in row.keys():
        value = row[key]
        if isinstance(value, (list, tuple)):
            data[key] = list(value)
        elif isinstance(value, (int, float, str, type(None))):
            data[key] = value
        else:
            data[key] = str(value)
    return data


def _allowed_origins() -> List[str]:
    raw = os.getenv("PUZZLE_CORS_ORIGINS", "*")
    if raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(title="Sprint Chess Puzzle Service", version="1.0.0")
    instrument_fastapi(app)

    @app.middleware("http")
    async def observability_middleware(request, call_next):
        request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
        route = f"{request.method} {request.url.path}"
        set_request_context(route, request_id, "puzzle")
        start = time.perf_counter()
        response = None
        try:
            response = await call_next(request)
            return response
        finally:
            route_obj = request.scope.get("route")
            route_path = getattr(route_obj, "path", request.url.path)
            route = f"{request.method} {route_path}"
            set_request_context(route, request_id, "puzzle")
            duration_ms = (time.perf_counter() - start) * 1000
            status_code = response.status_code if response else 500
            record_http_metrics(route, request.method, status_code, duration_ms)
            clear_request_context()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def startup_event():
        await start_event_loop_lag_monitor()
        database_url = _require_database_url()
        app.state.pg_pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
        instrument_asyncpg_pool(app.state.pg_pool)
        app.state.redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)

    @app.on_event("shutdown")
    async def shutdown_event():
        if hasattr(app.state, "pg_pool"):
            await app.state.pg_pool.close()
        if hasattr(app.state, "redis"):
            await app.state.redis.close()

    @app.get("/healthz")
    async def healthz():
        """Health check endpoint for Kubernetes probes."""
        health = {"status": "healthy", "service": "puzzle"}
        try:
            async with app.state.pg_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            health["database"] = "connected"
        except Exception:
            health["database"] = "disconnected"
            health["status"] = "degraded"
        try:
            await app.state.redis.ping()
            health["redis"] = "connected"
        except Exception:
            health["redis"] = "disconnected"
            health["status"] = "degraded"
        return health

    @app.get("/puzzle/next")
    async def get_next_puzzle(
        mode: str = Query("random", regex="^(theme|repertoire|random)$"),
        rating: int = Query(1500, ge=400, le=3200),
        themes: Optional[List[str]] = Query(None),
        ecos: Optional[List[str]] = Query(None),
        user_id: Optional[str] = Query(None),
    ):
        redis_client = app.state.redis
        pool = app.state.pg_pool

        # Don't use cache - we want fresh puzzles every time
        # Users should not get the same puzzle twice in a row

        async with pool.acquire() as conn:
            # Exclude puzzles the user has recently attempted (last 50 puzzles)
            excluded_puzzles = []
            if user_id:
                try:
                    excluded_rows = await conn.fetch(
                        """
                        SELECT puzzle_id FROM user_puzzles
                        WHERE user_id = $1
                        ORDER BY created_at DESC
                        LIMIT 50
                        """,
                        user_id,
                    )
                    excluded_puzzles = [row["puzzle_id"] for row in excluded_rows]
                except Exception:
                    # If user doesn't exist or query fails, continue without exclusions
                    pass

            # Helper to build query parts
            where_clauses = []
            params = []
            param_idx = 1

            if mode == "theme":
                if not themes:
                    raise HTTPException(status_code=400, detail="themes query parameter required for theme mode")
                where_clauses.append(f"themes && ${param_idx}::text[]")
                params.append(themes)
                param_idx += 1
                
                where_clauses.append(f"rating BETWEEN ${param_idx} - 150 AND ${param_idx} + 150")
                params.append(rating)
                param_idx += 1

            elif mode == "repertoire":
                if not ecos:
                    raise HTTPException(status_code=400, detail="ecos query parameter required for repertoire mode")
                where_clauses.append(f"eco = ANY(${param_idx}::text[])")
                params.append(ecos)
                param_idx += 1
                
                where_clauses.append(f"rating BETWEEN ${param_idx} - 150 AND ${param_idx} + 150")
                params.append(rating)
                param_idx += 1

            else: # random
                where_clauses.append(f"rating BETWEEN ${param_idx} - 150 AND ${param_idx} + 150")
                params.append(rating)
                param_idx += 1

            if excluded_puzzles:
                where_clauses.append(f"id != ALL(${param_idx}::text[])")
                params.append(excluded_puzzles)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)
            
            # Use ORDER BY RANDOM() for much faster random selection
            # This avoids the slow COUNT(*) + OFFSET pattern
            data_query = f"""
                SELECT * FROM puzzles 
                WHERE {where_sql}
                ORDER BY RANDOM()
                LIMIT 1
            """
            row = await conn.fetchrow(data_query, *params)

        if not row:
            raise HTTPException(status_code=404, detail="No puzzle found")

        puzzle = _row_to_dict(row)
        # Don't cache puzzles since we want different ones each time
        return puzzle

    @app.get("/puzzle/{puzzle_id}")
    async def get_puzzle_by_id(puzzle_id: str):
        """Fetch a specific puzzle by its ID."""
        pool = app.state.pg_pool

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM puzzles WHERE id = $1",
                puzzle_id,
            )

        if not row:
            raise HTTPException(status_code=404, detail="Puzzle not found")

        return _row_to_dict(row)

    @app.post("/puzzle/submit")
    async def submit_puzzle(attempt: Attempt):
        pool = app.state.pg_pool

        async with pool.acquire() as conn:
            puzzle_row = await conn.fetchrow("SELECT rating FROM puzzles WHERE id = $1", attempt.puzzle_id)
            if not puzzle_row:
                raise HTTPException(status_code=404, detail="Puzzle not found")

            user_row = await conn.fetchrow(
                "SELECT puzzle_rating, puzzles_done, streak FROM users WHERE id = $1",
                attempt.user_id,
            )

            current_rating = user_row["puzzle_rating"] if user_row else 1500
            new_rating = update_rating(current_rating, puzzle_row["rating"], attempt.correct)

            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO user_puzzles (user_id, puzzle_id, correct, time_spent)
                    VALUES ($1, $2, $3, $4)
                    """,
                    attempt.user_id,
                    attempt.puzzle_id,
                    attempt.correct,
                    attempt.time_spent,
                )

                await conn.execute(
                    """
                    INSERT INTO users (id, email, puzzle_rating, puzzles_done, streak, last_active)
                    VALUES ($1, $2, $3, 1, $4, NOW())
                    ON CONFLICT (id)
                    DO UPDATE SET
                        puzzle_rating = EXCLUDED.puzzle_rating,
                        puzzles_done = users.puzzles_done + 1,
                        streak = CASE
                            WHEN $5 THEN users.streak + 1
                            ELSE 0
                        END,
                        last_active = NOW();
                    """,
                    attempt.user_id,
                    f"{attempt.user_id}@puzzle.local",
                    new_rating,
                    1 if attempt.correct else 0,
                    attempt.correct,
                )

        return {"new_rating": new_rating, "delta": new_rating - current_rating}

    @app.get("/puzzle/user/{user_id}")
    async def get_user_rating(user_id: str):
        pool = app.state.pg_pool

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT puzzle_rating, puzzles_done, streak
                FROM users
                WHERE id = $1
                """,
                user_id,
            )

            if not row:
                await conn.execute(
                    "INSERT INTO users (id, puzzle_rating, puzzles_done, streak) VALUES ($1, 1500, 0, 0)",
                    user_id,
                )
                return {"user_id": user_id, "rating": 1500, "puzzles_done": 0, "streak": 0}

            return {
                "user_id": user_id,
                "rating": row["puzzle_rating"],
                "puzzles_done": row["puzzles_done"],
                "streak": row["streak"],
            }

    return app


app = create_app()
