"""
Imports router - Game import operations and proxies to import service.
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
import httpx

from gateway_modules.dependencies import get_pool, get_owner_from_request

router = APIRouter(tags=["imports"])

IMPORT_URL = os.getenv("IMPORT_URL", "http://import:8000")


@router.post("/imports")
async def create_import(request: Request):
    """
    Create an import batch. Body: { source, username, filters }
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    body = await request.json()
    source = body.get("source")
    username = body.get("username")
    filters = body.get("filters")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO imports (user_id, session_id, source, username, filters)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING id, status
            """,
            user_id, session_id, source, username, filters,
        )
    return {"id": str(row["id"]), "status": row["status"]}


@router.get("/imports")
async def list_imports(request: Request, limit: int = 50, offset: int = 0):
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    pool = await get_pool()
    async with pool.acquire() as conn:
        if user_id:
            rows = await conn.fetch(
                """
                SELECT id, source, username, status, created_at
                FROM imports
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                user_id, limit, offset,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, source, username, status, created_at
                FROM imports
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                session_id, limit, offset,
            )
    items = [dict(r) for r in rows]
    # stringify UUIDs for JSON
    for it in items:
        it["id"] = str(it["id"]) if it.get("id") else None
    return {"items": items, "limit": limit, "offset": offset}


@router.post("/import/games/fetch")
async def import_fetch_games(payload: dict):
    """
    Forward import requests to import-service. Expects payload like:
    {"source": "lichess.org"|"chess.com", "username": "...", "filters": {...}}
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            r = await client.post(f"{IMPORT_URL}/games/fetch", json=payload)
            r.raise_for_status()
            return r.json()
        except httpx.TimeoutException as e:
            raise HTTPException(status_code=504, detail=f"Import service timeout: {e}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Import HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Import proxy error: {e}")


@router.post("/import/games/fetch/stream")
async def import_fetch_games_stream(payload: dict):
    """
    Stream NDJSON from import-service for incremental UI updates.
    """
    async def gen():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", f"{IMPORT_URL}/games/fetch/stream", json=payload) as r:
                    r.raise_for_status()
                    async for chunk in r.aiter_bytes():
                        if not chunk:
                            continue
                        yield chunk
        except httpx.HTTPStatusError as e:
            yield (str(e) + "\n").encode()
        except Exception as e:
            yield (f"error: {e}\n").encode()

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@router.post("/import/games/fetch-by-url")
async def import_fetch_game_by_url(payload: dict):
    """
    Fetch a single game by URL from Lichess or Chess.com via import-service.
    Expected payload: {"url": "...", "source": "lichess.org"|"chess.com"}
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(f"{IMPORT_URL}/games/fetch-by-url", json=payload)
            r.raise_for_status()
            return r.json()
        except httpx.TimeoutException as e:
            raise HTTPException(status_code=504, detail=f"Import service timeout: {e}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Import HTTP error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Import proxy error: {e}")


@router.get("/external/chesscom/player/{username}/archives")
async def chesscom_archives_proxy(username: str):
    """
    Proxy to Chess.com archives API
    """
    target = f"https://api.chess.com/pub/player/{username}/games/archives"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(target)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Chess.com error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chess.com proxy error: {e}")


@router.get("/external/chesscom/proxy")
async def chesscom_proxy(url: str):
    """
    Generic proxy for Chess.com API resources (like individual archives)
    """
    if not url.startswith("https://api.chess.com/"):
        raise HTTPException(status_code=400, detail="Invalid Chess.com URL")
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Chess.com error: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chess.com proxy error: {e}")


@router.get("/external/lichess/export/{game_id}")
async def lichess_export_proxy(game_id: str, request: Request):
    """
    Proxy to Lichess game export (PGN/JSON)
    """
    query = request.url.query
    target = f"https://lichess.org/game/export/{game_id}"
    if query:
        target = f"{target}?{query}"
        
    req_headers = {}
    if request.headers.get("Accept"):
        req_headers["Accept"] = request.headers.get("Accept")

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", target, headers=req_headers) as r:
                    r.raise_for_status()
                    async for chunk in r.aiter_bytes():
                        if not chunk:
                            continue
                        yield chunk
        except Exception as e:
            yield (f"error: {e}\n").encode()

    return StreamingResponse(gen())
