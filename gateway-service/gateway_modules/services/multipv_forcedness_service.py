"""
MultiPV Forcedness Filter Service.

Prevents "engine quiz" puzzles by requiring the solution to be meaningfully unique.
Uses MultiPV analysis to compute the gap between best and second-best moves.

This is Step 2 of the ML pipeline augmentation.

Feature flag: ml_config.multipv_forcedness_filter
"""

import asyncio
import hashlib
import json
import os
from typing import Optional, Dict, Any, List, Tuple, TYPE_CHECKING

import httpx
import asyncpg

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig

from ..models.explain import ForcednessExplain


STOCKFISH_URL = os.getenv("STOCKFISH_URL", "http://stockfish:5000")

# Limit concurrent Stockfish requests
_stockfish_semaphore = asyncio.Semaphore(10)


async def evaluate_with_multipv(
    fen: str,
    depth: int = 12,
    multipv: int = 3,
    pool: Optional[asyncpg.Pool] = None,
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Any]:
    """
    Evaluate a position with MultiPV to get multiple top moves.
    
    Args:
        fen: FEN string of the position
        depth: Analysis depth
        multipv: Number of principal variations to request
        pool: Optional database pool for caching
        ml_config: Optional ML configuration
        
    Returns:
        Dict with keys:
        - cp: Best move score in centipawns
        - depth: Analysis depth achieved
        - mate: Mate distance if applicable
        - best_move: Best move in SAN notation
        - pv: Principal variation of best move
        - multipv_lines: List of all PV lines with scores
        - multipv_gap_cp: Gap between best and second-best in centipawns
        - is_forced: True if move is "forced" (gap >= threshold)
    """
    config = ml_config
    forced_threshold = 150  # Default threshold
    
    if config:
        forced_threshold = config.forced_threshold_cp
        multipv = config.multipv_count
    
    if not fen:
        return _empty_result()
    
    # Cache key includes multipv count
    cache_key = f"{fen}_{depth}_mpv{multipv}"
    engine_hash = hashlib.md5(cache_key.encode()).hexdigest()
    
    # Check cache first
    if pool:
        cached = await _get_cached_analysis(pool, engine_hash)
        if cached:
            return cached
    
    # Call Stockfish API with MultiPV
    try:
        async with _stockfish_semaphore:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{STOCKFISH_URL}/analyze",
                    json={
                        "fen": fen,
                        "depth": depth,
                        "multipv": multipv,
                    }
                )
                response.raise_for_status()
                result = response.json()
    except httpx.TimeoutException:
        # Fallback to lower depth on timeout
        if depth > 8:
            return await evaluate_with_multipv(fen, depth=8, multipv=multipv, pool=pool, ml_config=ml_config)
        return _empty_result()
    except Exception as e:
        print(f"MultiPV Stockfish API error: {e}")
        return _empty_result()
    
    # Parse response
    analysis_list = result.get("analysis") if isinstance(result, dict) else result
    if not analysis_list or not isinstance(analysis_list, list):
        return _empty_result()
    
    # Extract all PV lines
    multipv_lines = []
    for i, pv_data in enumerate(analysis_list[:multipv]):
        score = pv_data.get("score", 0)
        cp = _parse_score_to_cp(score)
        mate = _parse_score_to_mate(score)
        
        multipv_lines.append({
            "rank": i + 1,
            "move": pv_data.get("move", ""),
            "cp": cp,
            "mate": mate,
            "pv": pv_data.get("pv", []),
            "depth": pv_data.get("depth", depth),
        })
    
    if len(multipv_lines) == 0:
        return _empty_result()
    
    # Extract best move data
    best = multipv_lines[0]
    
    # Compute gap between best and second-best
    multipv_gap_cp = 0
    if len(multipv_lines) >= 2:
        best_score = best["cp"]
        second_score = multipv_lines[1]["cp"]
        
        # Handle mate scores specially
        if best["mate"] is not None and multipv_lines[1]["mate"] is None:
            # Mate vs no mate = huge gap
            multipv_gap_cp = 10000
        elif best["mate"] is None and multipv_lines[1]["mate"] is not None:
            # This shouldn't happen (second is mate, best isn't)
            multipv_gap_cp = 0
        elif best["mate"] is not None and multipv_lines[1]["mate"] is not None:
            # Both are mates - compare mate distances
            multipv_gap_cp = abs(best["mate"] - multipv_lines[1]["mate"]) * 500
        else:
            # Normal centipawn comparison
            multipv_gap_cp = abs(best_score - second_score)
    else:
        # Only one legal move = forced by definition
        multipv_gap_cp = 10000
    
    is_forced = multipv_gap_cp >= forced_threshold
    
    eval_result = {
        "cp": best["cp"],
        "depth": best["depth"],
        "mate": best["mate"],
        "best_move": best["move"],
        "pv": best["pv"],
        "multipv_lines": multipv_lines,
        "multipv_gap_cp": multipv_gap_cp,
        "is_forced": is_forced,
    }
    
    # Cache result
    if pool:
        await _cache_analysis(pool, fen, engine_hash, eval_result)
    
    return eval_result


def _empty_result() -> Dict[str, Any]:
    """Return empty result structure."""
    return {
        "cp": 0,
        "depth": 0,
        "mate": None,
        "best_move": "",
        "pv": [],
        "multipv_lines": [],
        "multipv_gap_cp": 0,
        "is_forced": False,
    }


def _parse_score_to_cp(score: Any) -> int:
    """Parse score to centipawns."""
    if isinstance(score, str) and score.startswith("mate"):
        try:
            mate_value = int(score.split()[1])
            return 10000 if mate_value > 0 else -10000
        except (ValueError, IndexError):
            return 0
    elif isinstance(score, (int, float)):
        return int(score)
    return 0


def _parse_score_to_mate(score: Any) -> Optional[int]:
    """Parse score to mate distance if applicable."""
    if isinstance(score, str) and score.startswith("mate"):
        try:
            return int(score.split()[1])
        except (ValueError, IndexError):
            return None
    return None


async def _get_cached_analysis(pool: asyncpg.Pool, engine_hash: str) -> Optional[Dict[str, Any]]:
    """Get cached MultiPV analysis."""
    try:
        async with pool.acquire() as conn:
            cached = await conn.fetchrow(
                """
                SELECT engine FROM analyses 
                WHERE engine_hash = $1 
                AND created_at > NOW() - INTERVAL '30 days'
                ORDER BY created_at DESC 
                LIMIT 1
                """,
                engine_hash
            )
            if cached and cached["engine"]:
                engine_data = cached["engine"]
                if isinstance(engine_data, str):
                    engine_data = json.loads(engine_data)
                
                # Check if this is a MultiPV result
                if engine_data and "multipv_lines" in engine_data:
                    return engine_data
    except Exception as e:
        print(f"MultiPV cache lookup failed: {e}")
    return None


async def _cache_analysis(pool: asyncpg.Pool, fen: str, engine_hash: str, result: Dict[str, Any]) -> None:
    """Cache MultiPV analysis result."""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO analyses (fen, engine_hash, engine, created_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (engine_hash) DO UPDATE SET
                    engine = EXCLUDED.engine,
                    created_at = EXCLUDED.created_at
                """,
                fen,
                engine_hash,
                json.dumps(result)
            )
    except Exception as e:
        print(f"MultiPV cache write failed: {e}")


def compute_forcedness_penalty(
    is_forced: bool,
    multipv_gap_cp: int,
    forcedness_mode: str = "soft",
    soft_penalty: float = 0.6,
) -> Tuple[float, ForcednessExplain]:
    """
    Compute quality penalty based on forcedness.
    
    Args:
        is_forced: Whether the move is considered "forced"
        multipv_gap_cp: Gap in centipawns between best and second-best
        forcedness_mode: "soft" or "hard"
        soft_penalty: Quality multiplier for non-forced moves in soft mode
        
    Returns:
        Tuple of (penalty_multiplier, explain)
    """
    if is_forced:
        # No penalty for forced moves
        penalty = 1.0
        rationale = f"Move is forced (gap={multipv_gap_cp}cp >= threshold). Full quality score."
    else:
        if forcedness_mode == "hard":
            # Hard mode: discard non-forced puzzles (penalty = 0)
            penalty = 0.0
            rationale = f"Move not forced (gap={multipv_gap_cp}cp < threshold). HARD mode: puzzle discarded."
        else:
            # Soft mode: reduce quality score
            penalty = soft_penalty
            rationale = f"Move not forced (gap={multipv_gap_cp}cp < threshold). SOFT mode: quality reduced by {int((1-soft_penalty)*100)}%."
    
    explain = ForcednessExplain(
        inputs_used={
            "multipv_gap_cp": multipv_gap_cp,
            "is_forced": is_forced,
        },
        scoring_rules={
            "threshold": "gap >= 150cp",
            "mode": forcedness_mode,
            "soft_penalty": str(soft_penalty),
        },
        rationale=rationale,
        multipv_lines=[],  # Will be populated by caller
        multipv_gap_cp=multipv_gap_cp,
        is_forced=is_forced,
        forcedness_mode=forcedness_mode,
        penalty_applied=penalty if penalty < 1.0 else None,
    )
    
    return penalty, explain


def apply_forcedness_filter(
    puzzle: Dict[str, Any],
    eval_data: Dict[str, Any],
    ml_config: Optional["MLConfig"] = None,
) -> Tuple[bool, Dict[str, Any]]:
    """
    Apply forcedness filter to a puzzle.
    
    Args:
        puzzle: The puzzle candidate dict
        eval_data: Evaluation data containing multipv_gap_cp and is_forced
        ml_config: ML configuration
        
    Returns:
        Tuple of (should_keep, updated_puzzle)
    """
    from ..config.ml_config import get_ml_config
    
    config = ml_config or get_ml_config()
    
    # Extract forcedness data from eval
    multipv_gap_cp = eval_data.get("multipv_gap_cp", 0)
    is_forced = eval_data.get("is_forced", False)
    multipv_lines = eval_data.get("multipv_lines", [])
    
    # Compute penalty
    penalty, explain = compute_forcedness_penalty(
        is_forced=is_forced,
        multipv_gap_cp=multipv_gap_cp,
        forcedness_mode=config.forcedness_mode,
        soft_penalty=config.forcedness_soft_penalty,
    )
    
    # Add multipv lines to explain
    explain.multipv_lines = multipv_lines[:3]  # Top 3 lines for context
    
    # Determine if puzzle should be kept
    if config.forcedness_mode == "hard" and not is_forced:
        should_keep = False
    else:
        should_keep = True
    
    # Apply penalty to quality score if present
    if "quality_score" in puzzle and penalty < 1.0:
        puzzle["quality_score"] = puzzle["quality_score"] * penalty
    
    # Add forcedness data to puzzle
    puzzle["multipv_gap_cp"] = multipv_gap_cp
    puzzle["is_forced"] = is_forced
    puzzle["forcedness_penalty"] = penalty
    puzzle["forcedness_explain"] = explain.model_dump()
    
    return should_keep, puzzle
