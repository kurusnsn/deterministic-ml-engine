"""
Chess.com Game Sync Service

Fetches and syncs games from Chess.com for users with linked accounts.
Uses monthly archive-based sync to avoid re-fetching old games.
"""

import asyncio
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, Any, List

import httpx
import asyncpg


CHESSCOM_ARCHIVES_URL = "https://api.chess.com/pub/player/{username}/games/archives"
PROVIDER_NAME = "chesscom"


async def get_chesscom_username(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str]
) -> Optional[str]:
    """Get Chess.com username from linked_accounts table."""
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                "SELECT username FROM linked_accounts WHERE user_id = $1 AND platform = 'chess.com'",
                user_id
            )
        else:
            row = await conn.fetchrow(
                "SELECT username FROM linked_accounts WHERE session_id = $1 AND platform = 'chess.com'",
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
                """SELECT last_synced_at, last_synced_month, sync_status, error_message, games_synced
                   FROM external_game_sync_state 
                   WHERE user_id = $1 AND provider = $2""",
                user_id, provider
            )
        else:
            row = await conn.fetchrow(
                """SELECT last_synced_at, last_synced_month, sync_status, error_message, games_synced
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
    last_synced_month: Optional[str] = None,
    error_message: Optional[str] = None,
    games_synced: Optional[int] = None
):
    """Update or create sync state for a provider."""
    async with pool.acquire() as conn:
        if user_id:
            await conn.execute(
                """INSERT INTO external_game_sync_state 
                   (user_id, provider, sync_status, last_synced_at, last_synced_month, error_message, games_synced, updated_at)
                   VALUES ($1, $2, $3, NOW(), $4, $5, COALESCE($6, 0), NOW())
                   ON CONFLICT (user_id, provider) DO UPDATE SET
                     sync_status = EXCLUDED.sync_status,
                     last_synced_at = CASE WHEN EXCLUDED.sync_status = 'idle' THEN NOW() ELSE external_game_sync_state.last_synced_at END,
                     last_synced_month = COALESCE(EXCLUDED.last_synced_month, external_game_sync_state.last_synced_month),
                     error_message = EXCLUDED.error_message,
                     games_synced = COALESCE(EXCLUDED.games_synced, external_game_sync_state.games_synced),
                     updated_at = NOW()""",
                user_id, provider, status, last_synced_month, error_message, games_synced
            )
        else:
            await conn.execute(
                """INSERT INTO external_game_sync_state 
                   (session_id, provider, sync_status, last_synced_at, last_synced_month, error_message, games_synced, updated_at)
                   VALUES ($1, $2, $3, NOW(), $4, $5, COALESCE($6, 0), NOW())
                   ON CONFLICT (session_id, provider) DO UPDATE SET
                     sync_status = EXCLUDED.sync_status,
                     last_synced_at = CASE WHEN EXCLUDED.sync_status = 'idle' THEN NOW() ELSE external_game_sync_state.last_synced_at END,
                     last_synced_month = COALESCE(EXCLUDED.last_synced_month, external_game_sync_state.last_synced_month),
                     error_message = EXCLUDED.error_message,
                     games_synced = COALESCE(EXCLUDED.games_synced, external_game_sync_state.games_synced),
                     updated_at = NOW()""",
                session_id, provider, status, last_synced_month, error_message, games_synced
            )


def compute_game_digest(game: dict) -> str:
    """Compute a stable hash for deduplication based on game properties."""
    key_parts = [
        game.get("url", ""),
        str(game.get("end_time", "")),
        game.get("white", {}).get("username", ""),
        game.get("black", {}).get("username", ""),
    ]
    return hashlib.sha256(":".join(key_parts).encode()).hexdigest()[:16]


def extract_game_id_from_url(url: str) -> str:
    """Extract game ID from Chess.com game URL."""
    # URLs look like https://www.chess.com/game/live/12345678
    if url:
        parts = url.rstrip("/").split("/")
        if parts:
            return parts[-1]
    return ""


def extract_game_data(game: dict, username: str) -> dict:
    """Extract relevant game data from Chess.com API response."""
    white = game.get("white", {})
    black = game.get("black", {})
    
    white_user = white.get("username", "Anonymous")
    black_user = black.get("username", "Anonymous")
    
    # Determine user's color and opponent
    is_white = white_user.lower() == username.lower()
    opponent = black_user if is_white else white_user
    
    # Get user's rating
    user_rating = white.get("rating") if is_white else black.get("rating")
    
    # Determine result
    white_result = white.get("result", "")
    black_result = black.get("result", "")
    
    if white_result == "win":
        result = "1-0"
    elif black_result == "win":
        result = "0-1"
    else:
        result = "1/2-1/2"
    
    # Get time control
    time_control = game.get("time_control", "")
    time_class = game.get("time_class", "")
    
    # Determine if game was rated
    rated = game.get("rated", True)  # Default to True for Chess.com
    
    # Convert end_time from epoch seconds to datetime
    end_time = game.get("end_time")
    played_at = datetime.utcfromtimestamp(end_time) if end_time else None
    
    # Extract game ID from URL
    game_url = game.get("url", "")
    game_id = extract_game_id_from_url(game_url)
    
    return {
        "source_id": game_id or compute_game_digest(game),
        "provider": PROVIDER_NAME,
        "pgn": game.get("pgn", ""),
        "opponent_username": opponent,
        "result": result,
        "time_control": time_control,
        "rated": rated,
        "perf": time_class,
        "start_time": played_at,  # Using end_time as start approximation
        "end_time": played_at,
        "termination": white_result if is_white else black_result,
        "opening_eco": None,  # Chess.com doesn't include opening in game response
        "opening_name": None,
        "url": game_url,
        "site": "chess.com",
        "digest": compute_game_digest(game),
        "played_at": played_at,
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
                game_data["pgn"], "chess.com", game_data["provider"], game_data["source_id"],
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
            print(f"Error storing Chess.com game: {e}")
            return False


def get_months_to_sync(last_synced_month: Optional[str], months_back: int = 6) -> List[str]:
    """
    Get list of months to sync from last_synced_month to current month.
    Format: YYYY/MM
    """
    now = datetime.utcnow()
    current_year = now.year
    current_month = now.month
    
    if last_synced_month:
        # Parse YYYY-MM format
        try:
            parts = last_synced_month.split("-")
            start_year = int(parts[0])
            start_month = int(parts[1])
        except (ValueError, IndexError):
            start_year = current_year
            start_month = current_month - months_back
    else:
        # Start from months_back ago
        start_date = now - timedelta(days=30 * months_back)
        start_year = start_date.year
        start_month = start_date.month
    
    months = []
    year, month = start_year, start_month
    
    while (year, month) <= (current_year, current_month):
        months.append(f"{year}/{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    
    return months


async def sync_chesscom_games_for_user(
    pool: asyncpg.Pool,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    max_games: int = 100,
    progress_callback: Optional[callable] = None
) -> dict:
    """
    Sync games from Chess.com for a user.
    
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
    
    # Get Chess.com username
    username = await get_chesscom_username(pool, user_id, session_id)
    if not username:
        result["error"] = "No Chess.com account linked"
        return result
    
    # Get current sync state
    sync_state = await get_sync_state(pool, user_id, session_id, PROVIDER_NAME)
    last_synced_month = sync_state.get("last_synced_month") if sync_state else None
    
    # Update status to syncing
    await update_sync_state(pool, user_id, session_id, PROVIDER_NAME, "syncing")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get available archives
            archives_url = CHESSCOM_ARCHIVES_URL.format(username=username.lower())
            resp = await client.get(archives_url)
            resp.raise_for_status()
            
            all_archives = resp.json().get("archives", [])
            
            # Determine which months to fetch
            months_to_sync = get_months_to_sync(last_synced_month)
            
            # Filter archives to only include months we need
            archives_to_fetch = []
            for archive_url in reversed(all_archives):  # Most recent first
                # Archive URLs are like: https://api.chess.com/pub/player/username/games/2024/01
                for month in months_to_sync:
                    if archive_url.endswith(month):
                        archives_to_fetch.append(archive_url)
                        break
            
            latest_month = None
            games_fetched = 0
            
            for archive_url in archives_to_fetch:
                if games_fetched >= max_games:
                    break
                
                # Extract month from URL
                url_parts = archive_url.rstrip("/").split("/")
                if len(url_parts) >= 2:
                    archive_month = f"{url_parts[-2]}-{url_parts[-1]}"
                else:
                    archive_month = None
                
                # Fetch games from this archive
                try:
                    resp = await client.get(archive_url)
                    resp.raise_for_status()
                    month_games = resp.json().get("games", [])
                except httpx.HTTPError:
                    continue
                
                for game in month_games:
                    if games_fetched >= max_games:
                        break
                    
                    # Skip non-standard variants
                    if (game.get("rules") or "").lower() != "chess":
                        continue
                    
                    # Skip games where user is not a participant
                    white_user = game.get("white", {}).get("username", "").lower()
                    black_user = game.get("black", {}).get("username", "").lower()
                    if username.lower() not in (white_user, black_user):
                        continue
                    
                    result["total_fetched"] += 1
                    games_fetched += 1
                    
                    # Extract and store game
                    game_data = extract_game_data(game, username)
                    if await store_game(pool, user_id, session_id, game_data):
                        result["synced_count"] += 1
                    
                    # Track latest month processed
                    if archive_month:
                        if not latest_month or archive_month > latest_month:
                            latest_month = archive_month
                    
                    # Call progress callback if provided
                    if progress_callback:
                        await progress_callback({
                            "fetched": result["total_fetched"],
                            "synced": result["synced_count"]
                        })
                
                # Small delay between archive fetches to respect rate limits
                await asyncio.sleep(0.5)
        
        # Update sync state with success
        current_state = await get_sync_state(pool, user_id, session_id, PROVIDER_NAME)
        total_games = (current_state.get("games_synced", 0) if current_state else 0) + result["synced_count"]
        
        await update_sync_state(
            pool, user_id, session_id, PROVIDER_NAME, "idle",
            last_synced_month=latest_month,
            games_synced=total_games
        )
        
        result["success"] = True
        
    except httpx.HTTPStatusError as e:
        result["error"] = f"Chess.com API error: {e.response.status_code}"
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
