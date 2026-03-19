"""
Puzzles router - Puzzle endpoints and saved puzzles management.
"""

import os
import time
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
import httpx
import asyncpg

from gateway_modules.dependencies import (
    get_pool,
    get_owner_from_request,
    log_activity,
)
import logging

logger = logging.getLogger(__name__)
from gateway_modules.observability import increment_analysis_requests, record_external_api_duration

router = APIRouter(tags=["puzzles"])

PUZZLE_URL = os.getenv("PUZZLE_URL", "http://puzzle:8081")


@router.get("/puzzles/next")
async def get_next_puzzle(
    mode: str = Query("random"),
    rating: int = Query(1500),
    themes: Optional[List[str]] = Query(None),
    ecos: Optional[List[str]] = Query(None),
):
    increment_analysis_requests("/puzzles/next")
    params: dict[str, Any] = {"mode": mode, "rating": rating}
    if themes:
        params["themes"] = themes
    if ecos:
        params["ecos"] = ecos

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            request_start = time.perf_counter()
            response = await client.get(f"{PUZZLE_URL}/puzzle/next", params=params)
            record_external_api_duration("puzzle", (time.perf_counter() - request_start) * 1000)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.json() if exc.response.content else {"detail": "Puzzle service error"}
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Puzzle service unavailable: {exc}") from exc

    return response.json()


@router.post("/puzzles/submit")
async def submit_puzzle(request: Request, payload: dict):
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(f"{PUZZLE_URL}/puzzle/submit", json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.json() if exc.response.content else {"detail": "Puzzle service error"}
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Puzzle service unavailable: {exc}") from exc

    result = response.json()

    # Log activity
    user_id, session_id = get_owner_from_request(request)
    pool = await get_pool()
    await log_activity(
        pool, user_id, session_id, "puzzle_solved",
        subject_id=payload.get("puzzleId"),
        meta={"success": result.get("success"), "rating": payload.get("rating")}
    )

    return result


@router.get("/puzzles/user/{user_id}")
async def get_puzzle_user(user_id: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(f"{PUZZLE_URL}/puzzle/user/{user_id}")
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.json() if exc.response.content else {"detail": "Puzzle service error"}
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Puzzle service unavailable: {exc}") from exc

    return response.json()


@router.get("/puzzles/{puzzle_id}")
async def get_puzzle_by_id(puzzle_id: str):
    """Fetch a specific puzzle by its ID."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(f"{PUZZLE_URL}/puzzle/{puzzle_id}")
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.json() if exc.response.content else {"detail": "Puzzle service error"}
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Puzzle service unavailable: {exc}") from exc

    return response.json()


# ----- Profile Saved Puzzles -----

class SavePuzzlesRequest(BaseModel):
    puzzles: List[dict]
    source_report_id: Optional[str] = None
    source_report_name: Optional[str] = None
    time_control: Optional[str] = None
    repertoire_type: Optional[str] = None


@router.post("/profile/puzzles")
async def save_puzzles_to_profile(request: Request, body: SavePuzzlesRequest):
    """Save puzzles from a report to user's profile."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()
    saved_count = 0
    
    async with pool.acquire() as conn:
        for puzzle in body.puzzles:
            try:
                await conn.execute("""
                    INSERT INTO saved_puzzles (
                        user_id, session_id, puzzle_id, fen, best_move, mistake_move,
                        themes, eco_code, move_number, mistake_type, side_to_move,
                        source_report_id, source_report_name, time_control, repertoire_type
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (user_id, puzzle_id) DO NOTHING
                """,
                    user_id or "",
                    session_id,
                    puzzle.get("puzzle_id", ""),
                    puzzle.get("fen", ""),
                    puzzle.get("best_move"),
                    puzzle.get("mistake_move"),
                    puzzle.get("theme", []),
                    puzzle.get("eco"),
                    puzzle.get("move_number"),
                    puzzle.get("mistake_type"),
                    puzzle.get("side_to_move"),
                    body.source_report_id,
                    body.source_report_name,
                    body.time_control,
                    body.repertoire_type
                )
                saved_count += 1
            except Exception as e:
                logger.info(f"Error saving puzzle: {e}")
                continue
    
    return {"saved": saved_count, "total": len(body.puzzles)}


@router.get("/profile/puzzles")
async def get_saved_puzzles(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """Get all saved puzzles for user's profile."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()

    async with pool.acquire() as conn:
        if user_id:
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM saved_puzzles WHERE user_id = $1",
                user_id
            )
            rows = await conn.fetch(
                """
                SELECT * FROM saved_puzzles
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                user_id, limit, offset
            )
        else:
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM saved_puzzles WHERE session_id = $1",
                session_id
            )
            rows = await conn.fetch(
                """
                SELECT * FROM saved_puzzles
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                session_id, limit, offset
            )
    
    puzzles = []
    for row in rows:
        puzzles.append({
            "id": str(row["id"]),
            "puzzle_id": row["puzzle_id"],
            "fen": row["fen"],
            "best_move": row["best_move"],
            "mistake_move": row["mistake_move"],
            "themes": row["themes"] or [],
            "eco_code": row["eco_code"],
            "move_number": row["move_number"],
            "mistake_type": row["mistake_type"],
            "side_to_move": row["side_to_move"],
            "source_report_id": str(row["source_report_id"]) if row["source_report_id"] else None,
            "source_report_name": row["source_report_name"],
            "time_control": row["time_control"],
            "repertoire_type": row["repertoire_type"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None
        })
    
    return {
        "puzzles": puzzles,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + len(puzzles)) < (total or 0),
    }


@router.delete("/profile/puzzles/{puzzle_db_id}")
async def delete_saved_puzzle(puzzle_db_id: str, request: Request):
    """Delete a saved puzzle from user's profile."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()
    
    if user_id:
        result = await pool.execute(
            "DELETE FROM saved_puzzles WHERE id = $1 AND user_id = $2",
            puzzle_db_id, user_id
        )
    else:
        result = await pool.execute(
            "DELETE FROM saved_puzzles WHERE id = $1 AND session_id = $2",
            puzzle_db_id, session_id
        )
    
    return {"deleted": "DELETE 1" in result}
