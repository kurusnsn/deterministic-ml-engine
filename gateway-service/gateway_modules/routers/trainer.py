"""
Trainer router - Personal trainer endpoints for chess improvement.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
import asyncpg

from gateway_modules.dependencies import get_pool, get_owner_from_request
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/me/trainer", tags=["trainer"])


@router.get("/summary")
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
    from gateway_modules.services.memory.memory_snapshot_service import (
        get_memory_snapshot,
        rebuild_memory_snapshot,
        should_rebuild_snapshot,
        get_user_game_count,
        MIN_GAMES_FOR_SNAPSHOT
    )
    
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
                # Rebuild in background
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


@router.post("/refresh")
async def refresh_trainer(
    request: Request,
    body: TrainerRefreshRequest = None,
    pool: asyncpg.Pool = Depends(get_pool)
):
    """
    Manually trigger a trainer refresh from recent games.
    
    Only rebuilds if there are new games since the last rebuild.
    """
    from gateway_modules.services.memory.memory_snapshot_service import (
        rebuild_memory_snapshot,
        should_rebuild_snapshot,
    )
    
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


@router.get("/puzzles")
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
    from gateway_modules.services.memory.memory_snapshot_service import (
        get_memory_snapshot,
        select_key_positions_for_training,
    )
    
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


@router.get("/pv-lines")
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
    from gateway_modules.services.memory.memory_snapshot_service import (
        get_memory_snapshot,
        select_key_positions_for_training,
    )
    
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
