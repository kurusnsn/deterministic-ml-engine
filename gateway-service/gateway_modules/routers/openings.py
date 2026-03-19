"""
Openings router - Opening book, ECO lookup, and mastered openings tracking.
"""

import io
import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
import httpx
import asyncpg
import chess
import chess.pgn

from gateway_modules.dependencies import get_pool, get_owner_from_request, log_activity
from gateway_modules.observability import record_external_api_duration
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["openings"])

OPENINGBOOK_URL = os.getenv("OPENINGBOOK_URL", "http://openingbook:8001")
ECO_URL = os.getenv("ECO_URL", "http://eco:8000")
INTERNAL_BOOK_PGN_FALLBACK_LIMIT = int(os.getenv("INTERNAL_BOOK_PGN_FALLBACK_LIMIT", "1000"))


def _fen_key(fen: str) -> str:
    # Ignore halfmove/fullmove counters to aggregate equivalent positions.
    parts = (fen or "").strip().split()
    return " ".join(parts[:4]) if len(parts) >= 4 else (fen or "").strip()


def _rows_to_book_moves(rows: list[asyncpg.Record]) -> list[dict]:
    return [
        {
            "san": row["san"],
            "uci": row["uci"] or "",
            "white": row["white"] or 0,
            "black": row["black"] or 0,
            "draws": row["draws"] or 0,
        }
        for row in rows
    ]


@router.post("/opening-book")
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
            request_start = time.perf_counter()
            r = await client.post(theory_url, json=payload)
            record_external_api_duration("opening-book", (time.perf_counter() - request_start) * 1000)
            logger.info(f"Gateway: Opening book response status: {r.status_code}")
            logger.info(f"Gateway: Opening book response headers: {dict(r.headers)}")
            result = r.json()
            logger.info(f"Gateway: Opening book response data: {result}")
            return result
        except Exception as e:
            logger.info(f"Gateway: Opening book service error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"OpeningBook service error: {str(e)}")


@router.get("/opening/book")
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
            request_start = time.perf_counter()
            r = await client.get(target)
            record_external_api_duration("opening-book", (time.perf_counter() - request_start) * 1000)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"OpeningBook HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpeningBook proxy error: {e}")


@router.post("/opening/popularity/by-fens")
async def opening_popularity_proxy(request: Request):
    """
    Proxy POST /opening/popularity/by-fens to opening-book-service.
    Returns game counts for a list of FEN positions.
    """
    target = f"{OPENINGBOOK_URL}/opening/popularity/by-fens"
    body = await request.json()
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            request_start = time.perf_counter()
            r = await client.post(target, json=body)
            record_external_api_duration("opening-book", (time.perf_counter() - request_start) * 1000)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Popularity service error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Popularity proxy error: {e}")


@router.post("/api/openings/master/line")
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


@router.get("/api/openings/mastered/stats")
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


@router.get("/opening/book/internal")
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
        fen = (fen or "").strip()
        fen_key = _fen_key(fen)

        # Fast path: use normalized lookup from precomputed moves table.
        moves_query = """
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
            move_rows = await conn.fetch(moves_query, fen_key)

        if move_rows:
            return {"moves": _rows_to_book_moves(move_rows)}

        # Fallback: build stats directly from stored game PGNs.
        async with pool.acquire() as conn:
            game_rows = await conn.fetch(
                """
                SELECT pgn, result
                FROM games
                WHERE pgn IS NOT NULL AND pgn <> ''
                ORDER BY COALESCE(played_at, created_at) DESC
                LIMIT $1
                """,
                INTERNAL_BOOK_PGN_FALLBACK_LIMIT,
            )

        aggregate: dict[tuple[str, str], dict] = defaultdict(
            lambda: {"san": "", "uci": "", "white": 0, "black": 0, "draws": 0}
        )

        for game_row in game_rows:
            pgn_text = game_row["pgn"]
            if not pgn_text:
                continue

            try:
                game = chess.pgn.read_game(io.StringIO(pgn_text))
            except Exception:
                continue
            if game is None:
                continue

            result = (game.headers.get("Result") or game_row["result"] or "").strip()
            board = game.board()
            for move in game.mainline_moves():
                before_key = _fen_key(board.fen())
                san = board.san(move)
                uci = move.uci()
                board.push(move)

                if before_key != fen_key:
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

        fallback_moves = sorted(
            aggregate.values(),
            key=lambda item: item["white"] + item["black"] + item["draws"],
            reverse=True,
        )[:20]

        return {"moves": fallback_moves}

    except Exception as e:
        logger.info(f"[Opening Book Internal] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database query error: {e}")


# ----- ECO Service Proxies -----

@router.post("/eco")
async def get_opening(payload: dict):
    """
    Forward FEN to eco-service for lookup
    """
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{ECO_URL}/eco", json=payload)
        return r.json()


@router.post("/eco/search")
async def eco_search(payload: dict):
    """
    Proxy opening name search to eco-service /search
    Expected payload: {"query": "sicilian"}
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(f"{ECO_URL}/search", json=payload)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"ECO search HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ECO search error: {e}")


@router.post("/eco/mainline")
async def eco_mainline(payload: dict):
    """
    Forward to eco-service to fetch representative mainline for an opening.
    Accepts { eco?: str, name?: str, query?: str, max_moves?: int }
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(f"{ECO_URL}/eco/mainline", json=payload)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"ECO mainline HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ECO mainline error: {e}")


@router.get("/eco/openings")
async def eco_openings(max_moves: int = 16, limit: int | None = None):
    params = {"max_moves": max_moves}
    if limit is not None:
        params["limit"] = limit
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(f"{ECO_URL}/openings", params=params)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"ECO openings HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ECO openings error: {e}")


@router.get("/external/lichess/explorer/masters")
async def lichess_explorer_masters_proxy(request: Request):
    """
    Proxy requests to Lichess Masters Explorer.
    """
    query = request.url.query
    target = "https://explorer.lichess.org/masters"
    if query:
        target = f"{target}?{query}"
        
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            request_start = time.perf_counter()
            r = await client.get(target)
            record_external_api_duration("lichess-explorer", (time.perf_counter() - request_start) * 1000)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Lichess Explorer error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lichess Explorer proxy error: {e}")
