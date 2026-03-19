"""
Move evaluation service using Stockfish engine.
"""

import hashlib
import json
import os
import asyncio
from typing import Optional, Dict, Any
import httpx
import asyncpg

STOCKFISH_URL = os.getenv("STOCKFISH_URL", "http://stockfish:5000")

# Limit concurrent Stockfish requests to avoid overloading the engine service
_stockfish_semaphore = asyncio.Semaphore(10)


async def evaluate_move_with_stockfish(
    fen: str,
    depth: int = 12,
    pool: Optional[asyncpg.Pool] = None
) -> Dict[str, Any]:
    """
    Evaluate a chess position using Stockfish engine.

    Args:
        fen: FEN string of the position to evaluate
        depth: Analysis depth (default 12, range 8-18)
        pool: Optional database pool for caching

    Returns:
        Dictionary with keys: cp, depth, mate, best_move, pv
    """
    if not fen:
        return {
            "cp": 0,
            "depth": 0,
            "mate": None,
            "best_move": "",
            "pv": []
        }

    # Check cache first if pool is provided
    if pool:
        engine_hash = hashlib.md5(f"{fen}_{depth}".encode()).hexdigest()
        try:
            async with pool.acquire() as conn:
                # Check cache with 30-day TTL
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
                    
                    if engine_data and "cp" in engine_data:
                        return {
                            "cp": engine_data.get("cp", 0),
                            "depth": engine_data.get("depth", depth),
                            "mate": engine_data.get("mate"),
                            "best_move": engine_data.get("best_move", ""),
                            "pv": engine_data.get("pv", [])
                        }
        except Exception as e:
            # If cache lookup fails, continue to API call
            print(f"Cache lookup failed: {e}")

    # Call Stockfish API with concurrency throttle
    try:
        async with _stockfish_semaphore:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{STOCKFISH_URL}/analyze",
                    json={"fen": fen, "depth": depth}
                )
                response.raise_for_status()
                result = response.json()
    except httpx.TimeoutException:
        # Fallback to lower depth on timeout
        if depth > 8:
            return await evaluate_move_with_stockfish(fen, depth=8, pool=pool)
        return {
            "cp": 0,
            "depth": 0,
            "mate": None,
            "best_move": "",
            "pv": []
        }
    except Exception as e:
        print(f"Stockfish API error: {e}")
        return {
            "cp": 0,
            "depth": 0,
            "mate": None,
            "best_move": "",
            "pv": []
        }

    # Parse Stockfish response
    # Response has format: {"fen": "...", "analysis": [{...}], "best_score": ...}
    analysis_list = result.get("analysis") if isinstance(result, dict) else result
    if not analysis_list or not isinstance(analysis_list, list) or len(analysis_list) == 0:
        return {
            "cp": 0,
            "depth": 0,
            "mate": None,
            "best_move": "",
            "pv": []
        }

    best_move_data = analysis_list[0]
    
    # Extract score - can be in "score" or "best_score" field
    score = best_move_data.get("score", result.get("best_score", 0) if isinstance(result, dict) else 0)
    cp = 0
    mate = None
    
    if isinstance(score, str) and score.startswith("mate"):
        # Parse "mate 3" format
        try:
            mate_value = int(score.split()[1])
            mate = mate_value
            # Convert mate to approximate centipawns for comparison
            cp = 10000 if mate_value > 0 else -10000
        except (ValueError, IndexError):
            cp = 0
    elif isinstance(score, (int, float)):
        cp = int(score)
    else:
        cp = 0

    # Extract best move (SAN notation)
    best_move = best_move_data.get("move", "")
    
    # Extract principal variation
    pv = best_move_data.get("pv", [])
    if not isinstance(pv, list):
        pv = []
    
    # Extract depth
    actual_depth = best_move_data.get("depth", depth)

    eval_result = {
        "cp": cp,
        "depth": actual_depth,
        "mate": mate,
        "best_move": best_move,
        "pv": pv
    }

    # Cache result if pool is provided
    if pool and cp != 0:
        try:
            async with pool.acquire() as conn:
                # Use ON CONFLICT to update existing cache entries (refresh TTL)
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
                    json.dumps(eval_result)
                )
        except Exception as e:
            # Cache failure is not critical
            print(f"Cache write failed: {e}")

    return eval_result
