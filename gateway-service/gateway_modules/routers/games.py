"""
Games router - CRUD operations for chess games.
"""

import hashlib
from typing import Optional, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
import asyncpg

from gateway_modules.dependencies import (
    get_pool,
    get_owner_from_request,
    log_activity,
    _dedupe_game_rows,
)

router = APIRouter(tags=["games"])


def _parse_ts(value: Any) -> Optional[datetime]:
    """Parse timestamp from various formats."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


@router.post("/games")
async def create_or_update_game(request: Request):
    """
    Upsert a game by (provider, source_id) when provided; otherwise dedupe by digest.
    Accepts a normalized payload with fields like pgn, provider, source_id, perf, etc.
    """
    body = await request.json()
    pgn: str = (body.get("pgn") or "").strip()
    if not pgn:
        raise HTTPException(status_code=400, detail="pgn is required")
    provider: Optional[str] = body.get("provider")
    source_id: Optional[str] = body.get("source_id")
    digest = hashlib.sha256(pgn.encode("utf-8")).hexdigest()

    user_id, session_id = get_owner_from_request(request)

    fields = {
        "user_id": user_id,
        "session_id": session_id,
        "provider": provider,
        "source_id": source_id,
        "rated": body.get("rated"),
        "perf": body.get("perf"),
        "time_control": body.get("time_control"),
        "start_time": _parse_ts(body.get("start_time")),
        "end_time": _parse_ts(body.get("end_time")),
        "result": body.get("result"),
        "termination": body.get("termination"),
        "opening_eco": body.get("opening_eco"),
        "opening_name": body.get("opening_name"),
        "url": body.get("url"),
        "site": body.get("site"),
        "pgn": pgn,
        "digest": digest,
        "opponent_username": body.get("opponent_username"),
    }

    pool = await get_pool()
    async with pool.acquire() as conn:
        if provider and source_id:
            # Upsert by provider/source_id
            row = await conn.fetchrow(
                """
                INSERT INTO games (user_id, session_id, provider, source_id, rated, perf, time_control,
                                   start_time, end_time, result, termination, opening_eco, opening_name,
                                   url, site, pgn, digest, opponent_username)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                ON CONFLICT (provider, source_id)
                DO UPDATE SET
                  rated = EXCLUDED.rated,
                  perf = EXCLUDED.perf,
                  time_control = EXCLUDED.time_control,
                  start_time = EXCLUDED.start_time,
                  end_time = EXCLUDED.end_time,
                  result = EXCLUDED.result,
                  termination = EXCLUDED.termination,
                  opening_eco = EXCLUDED.opening_eco,
                  opening_name = EXCLUDED.opening_name,
                  url = EXCLUDED.url,
                  site = EXCLUDED.site,
                  pgn = EXCLUDED.pgn,
                  digest = EXCLUDED.digest,
                  opponent_username = COALESCE(EXCLUDED.opponent_username, games.opponent_username)
                RETURNING id, provider, source_id
                """,
                fields["user_id"], fields["session_id"], fields["provider"], fields["source_id"],
                fields["rated"], fields["perf"], fields["time_control"],
                fields["start_time"], fields["end_time"], fields["result"], fields["termination"],
                fields["opening_eco"], fields["opening_name"], fields["url"], fields["site"],
                fields["pgn"], fields["digest"], fields["opponent_username"],
            )
        else:
            # No provider/source; try insert, if digest duplicate, ignore
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO games (user_id, session_id, provider, source_id, rated, perf, time_control,
                                       start_time, end_time, result, termination, opening_eco, opening_name,
                                       url, site, pgn, digest, opponent_username)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                    RETURNING id, provider, source_id
                    """,
                    fields["user_id"], fields["session_id"], fields["provider"], fields["source_id"],
                    fields["rated"], fields["perf"], fields["time_control"],
                    fields["start_time"], fields["end_time"], fields["result"], fields["termination"],
                    fields["opening_eco"], fields["opening_name"], fields["url"], fields["site"],
                    fields["pgn"], fields["digest"], fields["opponent_username"],
                )
            except asyncpg.exceptions.UniqueViolationError:
                # Digest uniqueness might not be enforced; fall back to selecting by digest
                row = await conn.fetchrow("SELECT id, provider, source_id FROM games WHERE digest=$1", digest)

        game_id = row["id"]
        
        # Now record the ownership in user_games join table
        if user_id:
            await conn.execute(
                "INSERT INTO user_games (user_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                user_id, game_id
            )
        elif session_id:
            await conn.execute(
                "INSERT INTO user_games (session_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                session_id, game_id
            )

    # Log activity
    await log_activity(
        pool, user_id, session_id, "games_imported",
        subject_id=str(game_id),
        meta={"provider": row["provider"], "source_id": row["source_id"]}
    )

    return {"id": game_id, "provider": row["provider"], "source_id": row["source_id"]}


@router.get("/games")
async def list_games(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    include_pgn: bool = Query(False, description="Include PGN data in results")
):
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    pool = await get_pool()
    select_fields = """
        g.id, g.provider, g.source_id, g.perf, g.time_control, g.result, g.rated,
        g.opponent_username, g.opening_eco, g.opening_name, g.url, g.site, g.start_time,
        g.end_time, g.created_at
    """
    if include_pgn:
        select_fields += ", g.pgn"

    async with pool.acquire() as conn:
        if user_id:
            rows = await conn.fetch(
                f"""
                SELECT {select_fields}
                FROM games g
                JOIN user_games ug ON g.id = ug.game_id
                WHERE ug.user_id = $1
                ORDER BY COALESCE(g.start_time, g.created_at) DESC
                LIMIT $2 OFFSET $3
                """,
                user_id, limit, offset,
            )
        else:
            rows = await conn.fetch(
                f"""
                SELECT {select_fields}
                FROM games g
                JOIN user_games ug ON g.id = ug.game_id
                WHERE ug.session_id = $1
                ORDER BY COALESCE(g.start_time, g.created_at) DESC
                LIMIT $2 OFFSET $3
                """,
                session_id, limit, offset,
            )
    return {
        "items": _dedupe_game_rows(rows),
        "limit": limit,
        "offset": offset,
    }


@router.get("/games/{game_id}/pgn")
async def get_game_pgn(game_id: int, request: Request):
    """Fetch PGN for a single game (used for lazy loading on profile/games pages)."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    pool = await get_pool()
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                """
                SELECT pgn FROM games g
                JOIN user_games ug ON g.id = ug.game_id 
                WHERE g.id = $1 AND ug.user_id = $2
                """,
                game_id, user_id,
            )
        else:
            row = await conn.fetchrow(
                """
                SELECT pgn FROM games g
                JOIN user_games ug ON g.id = ug.game_id
                WHERE g.id = $1 AND ug.session_id = $2
                """,
                game_id, session_id,
            )

    if not row or not row["pgn"]:
        raise HTTPException(status_code=404, detail="Game PGN not found")

    return {"pgn": row["pgn"]}
