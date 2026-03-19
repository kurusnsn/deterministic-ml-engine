"""
Lichess Game Sync Service

Fetches and syncs games from Lichess for users with linked accounts.
Uses incremental sync based on timestamp to avoid re-fetching old games.
"""

import asyncio
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, Any

import httpx
import asyncpg


LICHESS_API_URL = "https://lichess.org/api/games/user"
PROVIDER_NAME = "lichess"


async def get_lichess_username(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str]
) -> Optional[str]:
    """Get Lichess username from linked_accounts table."""
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                "SELECT username FROM linked_accounts WHERE user_id = $1 AND platform = 'lichess.org'",
                user_id
            )
        else:
            row = await conn.fetchrow(
                "SELECT username FROM linked_accounts WHERE session_id = $1 AND platform = 'lichess.org'",
                session_id
            )
        return row["username"] if row else None


async def get_sync_state(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    provider: str
) -> Optional[dict]:
    """Get current sync state for a provider."""
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                """SELECT last_synced_at, last_synced_timestamp, sync_status, error_message, games_synced
                   FROM external_game_sync_state 
                   WHERE user_id = $1 AND provider = $2""",
                user_id, provider
            )
        else:
            row = await conn.fetchrow(
                """SELECT last_synced_at, last_synced_timestamp, sync_status, error_message, games_synced
                   FROM external_game_sync_state 
                   WHERE session_id = $1 AND provider = $2""",
                session_id, provider
            )
        if not row:
            return None
        return dict(row)


async def update_sync_state(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    provider: str,
    status: str,
    last_synced_timestamp: Optional[int] = None,
    error_message: Optional[str] = None,
    games_synced: Optional[int] = None
):
    """Update or create sync state for a provider."""
    async with pool.acquire() as conn:
        if user_id:
            await conn.execute(
                """INSERT INTO external_game_sync_state 
                   (user_id, provider, sync_status, last_synced_at, last_synced_timestamp, error_message, games_synced, updated_at)
                   VALUES ($1, $2, $3, NOW(), $4, $5, COALESCE($6, 0), NOW())
                   ON CONFLICT (user_id, provider) DO UPDATE SET
                     sync_status = EXCLUDED.sync_status,
                     last_synced_at = CASE WHEN EXCLUDED.sync_status = 'idle' THEN NOW() ELSE external_game_sync_state.last_synced_at END,
                     last_synced_timestamp = COALESCE(EXCLUDED.last_synced_timestamp, external_game_sync_state.last_synced_timestamp),
                     error_message = EXCLUDED.error_message,
                     games_synced = COALESCE(EXCLUDED.games_synced, external_game_sync_state.games_synced),
                     updated_at = NOW()""",
                user_id, provider, status, last_synced_timestamp, error_message, games_synced
            )
        else:
            await conn.execute(
                """INSERT INTO external_game_sync_state 
                   (session_id, provider, sync_status, last_synced_at, last_synced_timestamp, error_message, games_synced, updated_at)
                   VALUES ($1, $2, $3, NOW(), $4, $5, COALESCE($6, 0), NOW())
                   ON CONFLICT (session_id, provider) DO UPDATE SET
                     sync_status = EXCLUDED.sync_status,
                     last_synced_at = CASE WHEN EXCLUDED.sync_status = 'idle' THEN NOW() ELSE external_game_sync_state.last_synced_at END,
                     last_synced_timestamp = COALESCE(EXCLUDED.last_synced_timestamp, external_game_sync_state.last_synced_timestamp),
                     error_message = EXCLUDED.error_message,
                     games_synced = COALESCE(EXCLUDED.games_synced, external_game_sync_state.games_synced),
                     updated_at = NOW()""",
                session_id, provider, status, last_synced_timestamp, error_message, games_synced
            )


def compute_game_digest(game: dict) -> str:
    """Compute a stable hash for deduplication based on game properties."""
    key_parts = [
        game.get("id", ""),
        str(game.get("createdAt", "")),
        game.get("players", {}).get("white", {}).get("user", {}).get("name", ""),
        game.get("players", {}).get("black", {}).get("user", {}).get("name", ""),
    ]
    return hashlib.sha256(":".join(key_parts).encode()).hexdigest()[:16]


def extract_game_data(game: dict, username: str) -> dict:
    """Extract relevant game data from Lichess API response."""
    players = game.get("players", {})
    white = players.get("white", {})
    black = players.get("black", {})
    
    white_user = white.get("user", {}).get("name", "Anonymous")
    black_user = black.get("user", {}).get("name", "Anonymous")
    
    # Determine user's color and opponent
    is_white = white_user.lower() == username.lower()
    opponent = black_user if is_white else white_user
    
    # Get user's rating (after the game)
    user_rating = white.get("rating") if is_white else black.get("rating")
    
    # Determine result from user's perspective
    winner = game.get("winner")
    if winner == "white":
        result = "1-0"
    elif winner == "black":
        result = "0-1"
    else:
        result = "1/2-1/2"
    
    # Get time control
    clock = game.get("clock", {})
    initial = clock.get("initial", 0) // 1000 if clock else 0
    increment = clock.get("increment", 0)
    time_control = f"{initial}+{increment}" if clock else game.get("speed", "")
    
    # Get opening info
    opening = game.get("opening", {})
    
    return {
        "source_id": game.get("id"),
        "provider": PROVIDER_NAME,
        "pgn": game.get("pgn", ""),
        "opponent_username": opponent,
        "result": result,
        "time_control": time_control,
        "rated": game.get("rated", False),
        "perf": game.get("perf", ""),
        "start_time": datetime.utcfromtimestamp(game.get("createdAt", 0) / 1000) if game.get("createdAt") else None,
        "end_time": datetime.utcfromtimestamp(game.get("lastMoveAt", 0) / 1000) if game.get("lastMoveAt") else None,
        "termination": game.get("status", ""),
        "opening_eco": opening.get("eco"),
        "opening_name": opening.get("name"),
        "url": f"https://lichess.org/{game.get('id')}",
        "site": "lichess.org",
        "digest": compute_game_digest(game),
        "played_at": datetime.utcfromtimestamp(game.get("createdAt", 0) / 1000) if game.get("createdAt") else None,
        "user_rating": user_rating,
    }


async def store_game(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    game_data: dict
) -> bool:
    """Store a game in the database, returning True if it was a new game."""
    from gateway_modules.services.game_sync.rating_snapshot_service import (
        store_rating_snapshot,
        normalize_time_control,
    )
    
    async with pool.acquire() as conn:
        try:
            # Check if game already exists
            existing = await conn.fetchval(
                """SELECT id FROM games 
                   WHERE provider = $1 AND source_id = $2""",
                game_data["provider"], game_data["source_id"]
            )
            if existing:
                return False  # Game already exists
            
            # Insert new game
            await conn.execute(
                """INSERT INTO games (
                    user_id, session_id, pgn, source, provider, source_id,
                    time_control, result, opponent_username, played_at,
                    rated, perf, start_time, end_time, termination,
                    opening_eco, opening_name, url, site, digest, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())""",
                user_id, session_id,
                game_data["pgn"], "lichess", game_data["provider"], game_data["source_id"],
                game_data["time_control"], game_data["result"], game_data["opponent_username"],
                game_data["played_at"], game_data["rated"], game_data["perf"],
                game_data["start_time"], game_data["end_time"], game_data["termination"],
                game_data["opening_eco"], game_data["opening_name"],
                game_data["url"], game_data["site"], game_data["digest"]
            )
            
            # Store rating snapshot if rating is available
            user_rating = game_data.get("user_rating")
            if user_rating and game_data.get("rated") and game_data.get("end_time"):
                normalized_tc = normalize_time_control(
                    game_data.get("perf", ""),
                    game_data.get("time_control", "")
                )
                await store_rating_snapshot(
                    pool,
                    user_id,
                    session_id,
                    provider=PROVIDER_NAME,
                    time_control=normalized_tc,
                    rating_type="game",
                    rating=user_rating,
                    recorded_at=game_data["end_time"],
                    source_id=game_data.get("source_id"),
                    source_type="game"
                )
            
            return True
        except Exception as e:
            print(f"Error storing Lichess game: {e}")
            return False


async def sync_lichess_games_for_user(
    pool: asyncpg.Pool,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    max_games: int = 100,
    progress_callback: Optional[callable] = None
) -> dict:
    """
    Sync games from Lichess for a user.
    
    Returns dict with:
        - success: bool
        - synced_count: int (new games added)
        - total_fetched: int
        - error: Optional[str]
    """
    result = {
        "success": False,
        "synced_count": 0,
        "total_fetched": 0,
        "error": None
    }
    
    if not user_id and not session_id:
        result["error"] = "No user or session context"
        return result
    
    # Get Lichess username
    username = await get_lichess_username(pool, user_id, session_id)
    if not username:
        result["error"] = "No Lichess account linked"
        return result
    
    # Get current sync state
    sync_state = await get_sync_state(pool, user_id, session_id, PROVIDER_NAME)
    
    # Determine since timestamp
    since_ms = None
    if sync_state and sync_state.get("last_synced_timestamp"):
        since_ms = sync_state["last_synced_timestamp"]
    else:
        # Initial sync: fetch last 6 months
        six_months_ago = datetime.utcnow() - timedelta(days=180)
        since_ms = int(six_months_ago.timestamp() * 1000)
    
    # Update status to syncing
    await update_sync_state(pool, user_id, session_id, PROVIDER_NAME, "syncing")
    
    try:
        # Fetch games from Lichess API
        params = {
            "max": max_games,
            "pgnInJson": "true",
            "opening": "true",
        }
        if since_ms:
            params["since"] = since_ms
        
        url = f"{LICHESS_API_URL}/{username}"
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "GET", url, params=params,
                headers={"Accept": "application/x-ndjson"}
            ) as resp:
                resp.raise_for_status()
                
                latest_timestamp = since_ms or 0
                
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    
                    try:
                        game = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    
                    # Skip non-standard variants
                    if (game.get("variant") or "").lower() != "standard":
                        continue
                    
                    result["total_fetched"] += 1
                    
                    # Extract and store game
                    game_data = extract_game_data(game, username)
                    if await store_game(pool, user_id, session_id, game_data):
                        result["synced_count"] += 1
                    
                    # Track latest timestamp
                    created_at = game.get("createdAt", 0)
                    if created_at > latest_timestamp:
                        latest_timestamp = created_at
                    
                    # Call progress callback if provided
                    if progress_callback:
                        await progress_callback({
                            "fetched": result["total_fetched"],
                            "synced": result["synced_count"]
                        })
        
        # Update sync state with success
        current_state = await get_sync_state(pool, user_id, session_id, PROVIDER_NAME)
        total_games = (current_state.get("games_synced", 0) if current_state else 0) + result["synced_count"]
        
        await update_sync_state(
            pool, user_id, session_id, PROVIDER_NAME, "idle",
            last_synced_timestamp=latest_timestamp if latest_timestamp > 0 else None,
            games_synced=total_games
        )
        
        result["success"] = True
        
    except httpx.HTTPStatusError as e:
        result["error"] = f"Lichess API error: {e.response.status_code}"
        await update_sync_state(
            pool, user_id, session_id, PROVIDER_NAME, "failed",
            error_message=result["error"]
        )
    except Exception as e:
        result["error"] = str(e)
        await update_sync_state(
            pool, user_id, session_id, PROVIDER_NAME, "failed",
            error_message=result["error"]
        )
    
    return result
