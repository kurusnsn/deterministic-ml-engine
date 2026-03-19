"""
Rating Snapshot Service

Stores rating snapshots for game and puzzle progress tracking.
Used by Lichess and Chess.com sync services during game import.
"""

from datetime import datetime
from typing import Optional

import asyncpg


async def store_rating_snapshot(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    provider: str,
    time_control: str,
    rating_type: str,
    rating: int,
    recorded_at: datetime,
    source_id: Optional[str] = None,
    source_type: Optional[str] = None
) -> bool:
    """
    Store a rating snapshot in the database.
    
    Uses upsert pattern to avoid duplicates when source_id is provided.
    Returns True if a new snapshot was inserted.
    """
    if not user_id and not session_id:
        return False
    
    if rating is None or rating <= 0:
        return False
    
    async with pool.acquire() as conn:
        try:
            if source_id:
                # Upsert when we have a source_id (game or puzzle)
                if user_id:
                    result = await conn.execute(
                        """INSERT INTO user_rating_snapshots 
                           (user_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                           ON CONFLICT (COALESCE(user_id::text, session_id::text), provider, source_id, rating_type)
                           DO NOTHING""",
                        user_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type
                    )
                else:
                    result = await conn.execute(
                        """INSERT INTO user_rating_snapshots 
                           (session_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                           ON CONFLICT (COALESCE(user_id::text, session_id::text), provider, source_id, rating_type)
                           DO NOTHING""",
                        session_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type
                    )
            else:
                # Simple insert when no source_id (e.g., periodic puzzle rating snapshot)
                if user_id:
                    result = await conn.execute(
                        """INSERT INTO user_rating_snapshots 
                           (user_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                        user_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type
                    )
                else:
                    result = await conn.execute(
                        """INSERT INTO user_rating_snapshots 
                           (session_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                        session_id, provider, time_control, rating_type, rating, recorded_at, source_id, source_type
                    )
            
            # Check if insert happened
            return "INSERT" in result
        except Exception as e:
            print(f"Error storing rating snapshot: {e}")
            return False


def normalize_time_control(perf: str, time_control: str) -> str:
    """
    Normalize time control string to canonical format.
    
    Args:
        perf: Performance category from API (e.g., "blitz", "rapid")
        time_control: Raw time control string (e.g., "300+5", "180+0")
    
    Returns:
        Canonical time control: "bullet", "blitz", "rapid", "classical", "correspondence"
    """
    # First try to use perf directly if it's a valid category
    perf_lower = (perf or "").lower()
    if perf_lower in ("bullet", "blitz", "rapid", "classical", "correspondence"):
        return perf_lower
    
    # Fall back to parsing time_control
    tc = (time_control or "").lower()
    
    # Parse time+increment format (e.g., "300+5")
    base_time = 0
    increment = 0
    
    if "+" in tc:
        try:
            parts = tc.split("+")
            base_time = int(parts[0])
            increment = int(parts[1]) if len(parts) > 1 else 0
        except (ValueError, IndexError):
            pass
    elif tc.isdigit():
        base_time = int(tc)
    
    # Calculate effective time (base + 40 moves * increment)
    effective_time = base_time + (40 * increment)
    
    if effective_time == 0:
        return "unknown"
    elif effective_time < 180:  # < 3 minutes effective
        return "bullet"
    elif effective_time < 600:  # < 10 minutes effective
        return "blitz"
    elif effective_time < 1800:  # < 30 minutes effective
        return "rapid"
    else:
        return "classical"
