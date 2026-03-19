"""
Studies router - CRUD operations for chess studies.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
import json
import asyncpg
import logging

from gateway_modules.dependencies import (
    get_pool,
    get_owner_from_request,
    log_activity,
    ALLOW_ANON_STUDIES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studies", tags=["studies"])


@router.post("")
async def create_study(request: Request, payload: dict, pool: asyncpg.Pool = Depends(get_pool)):
    """
    Create a new study for the current user
    Expected payload: {
        "name": "Study Name",
        "pgn": "1.e4 e5 2.Nf3...",
        "current_fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "current_path": "sy3a",
        "move_tree": {...},
        "messages": {...}
    }
    """
    logger.info("[BACKEND STUDY SAVE] Starting study save...")
    logger.info(f"[BACKEND STUDY SAVE] Payload keys: {list(payload.keys())}")

    required_fields = ["name", "pgn", "current_fen", "current_path", "move_tree", "messages"]
    for field in required_fields:
        if field not in payload:
            logger.info(f"[BACKEND STUDY SAVE] Missing required field: {field}")
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    # Determine owner: prefer authenticated user, otherwise session
    user_id, session_id = get_owner_from_request(request)
    logger.info(f"[BACKEND STUDY SAVE] user_id: {user_id}, session_id: {session_id}")
    logger.info(f"[BACKEND STUDY SAVE] ALLOW_ANON_STUDIES: {ALLOW_ANON_STUDIES}")

    if not user_id:
        # Only allow anonymous session if explicitly enabled
        if not (ALLOW_ANON_STUDIES and session_id):
            logger.info("[BACKEND STUDY SAVE] Auth required or session_id missing")
            raise HTTPException(status_code=401, detail="Auth required or session_id missing")

    try:
        logger.info(f"[BACKEND STUDY SAVE] Saving study '{payload['name']}'...")
        query = """
        INSERT INTO studies (user_id, session_id, name, pgn, current_fen, current_path, move_tree, messages, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id, created_at
        """

        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                query,
                user_id,
                session_id,
                payload["name"],
                payload["pgn"],
                payload["current_fen"],
                payload["current_path"],
                json.dumps(payload["move_tree"]),
                json.dumps(payload["messages"])
            )

        study_id = result["id"]
        logger.info(f"[BACKEND STUDY SAVE] Study saved with ID: {study_id}")

        # Log activity
        await log_activity(
            pool, user_id, session_id, "study_saved",
            subject_id=str(study_id),
            meta={"name": payload["name"]}
        )
        logger.info("[BACKEND STUDY SAVE] Activity logged")

        return {
            "success": True,
            "study_id": study_id,
            "created_at": result["created_at"].isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"[BACKEND STUDY SAVE] Error creating study: {e}")
        import traceback
        logger.info(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Failed to create study")


@router.get("")
async def get_user_studies(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    """Get all studies for the current user"""
    logger.info("[BACKEND STUDY FETCH] Starting studies fetch...")
    try:
        user_id, session_id = get_owner_from_request(request)
        logger.info(f"[BACKEND STUDY FETCH] user_id: {user_id}, session_id: {session_id}")
        logger.info(f"[BACKEND STUDY FETCH] ALLOW_ANON_STUDIES: {ALLOW_ANON_STUDIES}")

        if not user_id:
            if not (ALLOW_ANON_STUDIES and session_id):
                logger.info("[BACKEND STUDY FETCH] Auth required or session_id missing")
                raise HTTPException(status_code=401, detail="Auth required or session_id missing")

        if user_id:
            query = """
            SELECT id, name, LEFT(pgn, 400) as pgn_preview, current_fen, created_at, updated_at
            FROM studies
            WHERE user_id = $1
            ORDER BY updated_at DESC
            """
        else:
            query = """
            SELECT id, name, LEFT(pgn, 400) as pgn_preview, current_fen, created_at, updated_at
            FROM studies
            WHERE session_id = $1
            ORDER BY updated_at DESC
            """

        logger.info(f"[BACKEND STUDY FETCH] Querying with user_id={user_id}, session_id={session_id}")

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, user_id or session_id)

        logger.info(f"[BACKEND STUDY FETCH] Found {len(rows)} studies")

        studies = []
        for row in rows:
            pgn_preview = row["pgn_preview"] or ""

            study_data = {
                "id": row["id"],
                "name": row["name"],
                "pgn_preview": pgn_preview,
                "pgn": pgn_preview,
                "current_fen": row["current_fen"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat()
            }
            studies.append(study_data)
            logger.info(f"[BACKEND STUDY FETCH]   - Study {row['id']}: {row['name']}")

        response_data = {"studies": studies}
        logger.info(f"[BACKEND STUDY FETCH] Returning {len(studies)} studies")
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"[BACKEND STUDY FETCH] Error fetching studies: {e}")
        import traceback
        logger.info(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Failed to fetch studies")


@router.get("/{study_id}")
async def get_study(study_id: int, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    """Get a specific study with complete data"""
    try:
        user_id, session_id = get_owner_from_request(request)
        if not user_id:
            if not (ALLOW_ANON_STUDIES and session_id):
                raise HTTPException(status_code=401, detail="Auth required or session_id missing")
        query = """
        SELECT * FROM studies
        WHERE id = $1 AND (user_id = $2 OR session_id = $3)
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, study_id, user_id, session_id)

        if not row:
            raise HTTPException(status_code=404, detail="Study not found")

        return {
            "id": row["id"],
            "name": row["name"],
            "pgn": row["pgn"],
            "current_fen": row["current_fen"],
            "current_path": row["current_path"],
            "move_tree": json.loads(row["move_tree"]),
            "messages": json.loads(row["messages"]),
            "created_at": row["created_at"].isoformat(),
            "updated_at": row["updated_at"].isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error fetching study {study_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch study")


@router.delete("/{study_id}")
async def delete_study(study_id: int, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    """Delete a study"""
    try:
        user_id, session_id = get_owner_from_request(request)
        if not user_id:
            if not (ALLOW_ANON_STUDIES and session_id):
                raise HTTPException(status_code=401, detail="Auth required or session_id missing")
        query = """
        DELETE FROM studies
        WHERE id = $1 AND (user_id = $2 OR session_id = $3)
        RETURNING id
        """

        async with pool.acquire() as conn:
            result = await conn.fetchrow(query, study_id, user_id, session_id)

        if not result:
            raise HTTPException(status_code=404, detail="Study not found")

        # Log activity
        await log_activity(
            pool, user_id, session_id, "study_deleted",
            subject_id=str(study_id)
        )

        return {"success": True, "deleted_id": study_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error deleting study {study_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete study")
