"""
Game Sync Orchestrator

Coordinates syncing games from all linked external platforms.
Provides a unified interface for triggering and monitoring sync operations.
"""

import asyncio
from typing import Optional, Callable, Dict, Any, List
from dataclasses import dataclass

import asyncpg

from .lichess_sync import sync_lichess_games_for_user
from .chesscom_sync import sync_chesscom_games_for_user


@dataclass
class SyncProgress:
    """Progress information for a sync operation."""
    status: str  # 'starting' | 'syncing' | 'completed' | 'failed'
    provider: str
    message: str
    fetched: int = 0
    synced: int = 0
    error: Optional[str] = None


@dataclass
class SyncResult:
    """Result of a sync operation for all providers."""
    success: bool
    results: Dict[str, dict]
    total_synced: int
    total_fetched: int
    errors: List[str]


async def get_linked_providers(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str]
) -> List[str]:
    """Get list of platforms the user has linked."""
    async with pool.acquire() as conn:
        if user_id:
            rows = await conn.fetch(
                "SELECT DISTINCT platform FROM linked_accounts WHERE user_id = $1",
                user_id
            )
        else:
            rows = await conn.fetch(
                "SELECT DISTINCT platform FROM linked_accounts WHERE session_id = $1",
                session_id
            )
        return [row["platform"] for row in rows]


async def get_all_sync_states(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str]
) -> Dict[str, dict]:
    """Get sync state for all providers."""
    async with pool.acquire() as conn:
        if user_id:
            rows = await conn.fetch(
                """SELECT provider, last_synced_at, sync_status, error_message, games_synced
                   FROM external_game_sync_state WHERE user_id = $1""",
                user_id
            )
        else:
            rows = await conn.fetch(
                """SELECT provider, last_synced_at, sync_status, error_message, games_synced
                   FROM external_game_sync_state WHERE session_id = $1""",
                session_id
            )
        return {row["provider"]: dict(row) for row in rows}


async def sync_games_for_user(
    pool: asyncpg.Pool,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    providers: Optional[List[str]] = None,
    max_games_per_provider: int = 100,
    progress_callback: Optional[Callable[[SyncProgress], Any]] = None
) -> SyncResult:
    """
    Sync games from all linked providers for a user.
    
    Args:
        pool: Database connection pool
        user_id: Authenticated user ID (if available)
        session_id: Anonymous session ID (if no user_id)
        providers: Optional list of specific providers to sync (e.g., ['lichess.org', 'chess.com'])
        max_games_per_provider: Maximum games to fetch per provider
        progress_callback: Optional async callback for progress updates
    
    Returns:
        SyncResult with aggregated results from all providers
    """
    result = SyncResult(
        success=True,
        results={},
        total_synced=0,
        total_fetched=0,
        errors=[]
    )
    
    if not user_id and not session_id:
        result.success = False
        result.errors.append("No user or session context")
        return result
    
    # Get linked providers if not specified
    if providers is None:
        providers = await get_linked_providers(pool, user_id, session_id)
    
    if not providers:
        # No linked accounts - this is not an error, just nothing to sync
        return result
    
    # Sync each provider
    for platform in providers:
        if progress_callback:
            await progress_callback(SyncProgress(
                status="starting",
                provider=platform,
                message=f"Starting {platform} sync..."
            ))
        
        try:
            # Create provider-specific progress callback
            async def provider_progress(data):
                if progress_callback:
                    await progress_callback(SyncProgress(
                        status="syncing",
                        provider=platform,
                        message=f"Syncing from {platform}...",
                        fetched=data.get("fetched", 0),
                        synced=data.get("synced", 0)
                    ))
            
            # Sync based on provider
            if platform == "lichess.org":
                provider_result = await sync_lichess_games_for_user(
                    pool, user_id, session_id,
                    max_games=max_games_per_provider,
                    progress_callback=provider_progress
                )
            elif platform == "chess.com":
                provider_result = await sync_chesscom_games_for_user(
                    pool, user_id, session_id,
                    max_games=max_games_per_provider,
                    progress_callback=provider_progress
                )
            else:
                provider_result = {
                    "success": False,
                    "error": f"Unknown provider: {platform}",
                    "synced_count": 0,
                    "total_fetched": 0
                }
            
            # Accumulate results
            result.results[platform] = provider_result
            result.total_synced += provider_result.get("synced_count", 0)
            result.total_fetched += provider_result.get("total_fetched", 0)
            
            if not provider_result.get("success"):
                result.errors.append(f"{platform}: {provider_result.get('error', 'Unknown error')}")
            
            if progress_callback:
                await progress_callback(SyncProgress(
                    status="completed" if provider_result.get("success") else "failed",
                    provider=platform,
                    message=f"{platform} sync complete: {provider_result.get('synced_count', 0)} new games",
                    fetched=provider_result.get("total_fetched", 0),
                    synced=provider_result.get("synced_count", 0),
                    error=provider_result.get("error")
                ))
            
        except Exception as e:
            error_msg = f"{platform}: {str(e)}"
            result.errors.append(error_msg)
            result.results[platform] = {
                "success": False,
                "error": str(e),
                "synced_count": 0,
                "total_fetched": 0
            }
            
            if progress_callback:
                await progress_callback(SyncProgress(
                    status="failed",
                    provider=platform,
                    message=f"{platform} sync failed",
                    error=str(e)
                ))
        
        # Small delay between providers to avoid rate limiting
        await asyncio.sleep(1.0)
    
    # Overall success is true only if no errors
    result.success = len(result.errors) == 0
    
    return result


async def sync_single_provider(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    provider: str,
    max_games: int = 100
) -> dict:
    """
    Sync games from a single provider.
    
    Convenience method for triggering sync on account link.
    """
    if provider == "lichess.org":
        return await sync_lichess_games_for_user(pool, user_id, session_id, max_games=max_games)
    elif provider == "chess.com":
        return await sync_chesscom_games_for_user(pool, user_id, session_id, max_games=max_games)
    else:
        return {
            "success": False,
            "error": f"Unknown provider: {provider}",
            "synced_count": 0,
            "total_fetched": 0
        }
