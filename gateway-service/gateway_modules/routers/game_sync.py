"""
Game sync router - Linked accounts and game synchronization endpoints.
"""

import asyncio
import os

from fastapi import APIRouter, Depends, HTTPException, Request, Query
import asyncpg

from gateway_modules.dependencies import get_pool, get_owner_from_request
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["game-sync"])


@router.get("/profile/linked-accounts")
async def get_linked_accounts(request: Request):
    """Get user's linked accounts and settings"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get linked accounts
        if user_id:
            accounts_rows = await conn.fetch(
                "SELECT platform, username FROM linked_accounts WHERE user_id = $1 ORDER BY created_at",
                user_id
            )
            # Get show_only_my_games setting
            setting_row = await conn.fetchrow(
                "SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'show_only_my_games'",
                user_id
            )
        else:
            accounts_rows = await conn.fetch(
                "SELECT platform, username FROM linked_accounts WHERE session_id = $1 ORDER BY created_at",
                session_id
            )
            setting_row = await conn.fetchrow(
                "SELECT setting_value FROM user_settings WHERE session_id = $1 AND setting_key = 'show_only_my_games'",
                session_id
            )

        accounts = [{"platform": row["platform"], "username": row["username"]} for row in accounts_rows]
        show_only_my_games = bool(setting_row["setting_value"]) if setting_row else False

        return {
            "accounts": accounts,
            "show_only_my_games": show_only_my_games
        }


@router.post("/profile/linked-accounts")
async def add_linked_account(request: Request):
    """Add a new linked account and trigger initial game sync"""
    from gateway_modules.services.game_sync.sync_orchestrator import sync_single_provider
    
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    body = await request.json()
    platform = body.get("platform", "").strip()
    username = body.get("username", "").strip()

    if not platform or not username:
        raise HTTPException(status_code=400, detail="Platform and username are required")

    # Validate platform
    if platform not in ["chess.com", "lichess.org"]:
        raise HTTPException(status_code=400, detail="Invalid platform. Must be 'chess.com' or 'lichess.org'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """
                INSERT INTO linked_accounts (user_id, session_id, platform, username)
                VALUES ($1, $2, $3, $4)
                """,
                user_id, session_id, platform, username
            )
            
            # Trigger background sync for the newly linked provider
            asyncio.create_task(sync_single_provider(pool, user_id, session_id, platform, max_games=100))
            
            return {
                "success": True, 
                "message": "Account linked successfully. Games will sync in the background.",
                "sync_started": True
            }
        except Exception as e:
            if "unique constraint" in str(e).lower():
                raise HTTPException(status_code=400, detail="This account is already linked")
            raise HTTPException(status_code=500, detail="Failed to link account")


@router.delete("/profile/linked-accounts")
async def remove_linked_account(request: Request):
    """Remove a linked account"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    body = await request.json()
    platform = body.get("platform", "").strip()
    username = body.get("username", "").strip()

    if not platform or not username:
        raise HTTPException(status_code=400, detail="Platform and username are required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        if user_id:
            result = await conn.execute(
                "DELETE FROM linked_accounts WHERE user_id = $1 AND platform = $2 AND username = $3",
                user_id, platform, username
            )
        else:
            result = await conn.execute(
                "DELETE FROM linked_accounts WHERE session_id = $1 AND platform = $2 AND username = $3",
                session_id, platform, username
            )

        # Check if any rows were deleted
        deleted_count = int(result.split()[-1]) if result.split() else 0
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="Linked account not found")

        return {"success": True, "message": "Account unlinked successfully"}


@router.post("/profile/settings")
async def update_user_settings(request: Request):
    """Update user settings"""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")

    body = await request.json()

    pool = await get_pool()
    async with pool.acquire() as conn:
        for setting_key, setting_value in body.items():
            if user_id:
                await conn.execute(
                    """
                    INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (user_id, setting_key)
                    DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
                    """,
                    user_id, setting_key, setting_value
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO user_settings (session_id, setting_key, setting_value, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (session_id, setting_key)
                    DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
                    """,
                    session_id, setting_key, setting_value
                )

        return {"success": True, "message": "Settings updated successfully"}


@router.get("/api/profile/game-history")
async def get_game_history(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    Get all games for the current user, sorted by played_at descending.
    Includes games from Lichess, Chess.com, and manually imported games.
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Build query based on user_id or session_id
        if user_id:
            rows = await conn.fetch(
                """
                SELECT 
                    g.id, g.pgn, g.provider, g.source_id, g.time_control, g.result, 
                    g.opponent_username, g.played_at, g.start_time, g.end_time,
                    g.rated, g.perf, g.opening_eco, g.opening_name, g.url, g.site,
                    g.created_at
                FROM games g
                JOIN user_games ug ON g.id = ug.game_id
                WHERE ug.user_id = $1
                ORDER BY COALESCE(g.played_at, g.start_time, g.created_at) DESC, g.id DESC
                LIMIT $2 OFFSET $3
                """,
                user_id, limit, offset
            )
            total_count = await conn.fetchval(
                "SELECT COUNT(*) FROM user_games WHERE user_id = $1",
                user_id
            )
        else:
            rows = await conn.fetch(
                """
                SELECT 
                    g.id, g.pgn, g.provider, g.source_id, g.time_control, g.result, 
                    g.opponent_username, g.played_at, g.start_time, g.end_time,
                    g.rated, g.perf, g.opening_eco, g.opening_name, g.url, g.site,
                    g.created_at
                FROM games g
                JOIN user_games ug ON g.id = ug.game_id
                WHERE ug.session_id = $1
                ORDER BY COALESCE(g.played_at, g.start_time, g.created_at) DESC, g.id DESC
                LIMIT $2 OFFSET $3
                """,
                session_id, limit, offset
            )
            total_count = await conn.fetchval(
                "SELECT COUNT(*) FROM user_games WHERE session_id = $1",
                session_id
            )
        
        games = []
        for row in rows:
            game_date = row["start_time"] or row["played_at"] or row["created_at"]
            games.append({
                "id": row["id"],
                "played_at": game_date.isoformat() if game_date else None,
                "opponent_username": row["opponent_username"],
                "result": row["result"],
                "time_control": row["time_control"],
                "external_provider": row["provider"],
                "external_game_id": row["source_id"],
                "opening_eco": row["opening_eco"],
                "opening_name": row["opening_name"],
                "url": row["url"],
                "site": row["site"],
                "pgn_available": bool(row["pgn"]),
                "rated": row["rated"],
                "perf": row["perf"]
            })
        
        return {
            "games": games,
            "total": total_count,
            "limit": limit,
            "offset": offset
        }


@router.get("/api/profile/sync-status")
async def get_sync_status(request: Request):
    """Get sync status for all linked providers."""
    from gateway_modules.services.game_sync.sync_orchestrator import get_all_sync_states
    
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()
    
    # Get linked accounts
    async with pool.acquire() as conn:
        if user_id:
            accounts_rows = await conn.fetch(
                "SELECT platform, username FROM linked_accounts WHERE user_id = $1",
                user_id
            )
        else:
            accounts_rows = await conn.fetch(
                "SELECT platform, username FROM linked_accounts WHERE session_id = $1",
                session_id
            )
    
    linked_accounts = {row["platform"]: row["username"] for row in accounts_rows}
    
    # Get sync states
    sync_states = await get_all_sync_states(pool, user_id, session_id)
    
    # Combine into response
    providers_status = {}
    for platform, username in linked_accounts.items():
        provider_key = "lichess" if platform == "lichess.org" else "chesscom"
        state = sync_states.get(provider_key, {})
        
        providers_status[platform] = {
            "username": username,
            "status": state.get("sync_status", "never_synced"),
            "last_synced_at": state.get("last_synced_at").isoformat() if state.get("last_synced_at") else None,
            "games_synced": state.get("games_synced", 0),
            "error_message": state.get("error_message")
        }
    
    return {
        "providers": providers_status
    }


@router.post("/api/profile/sync/trigger")
async def trigger_sync(request: Request):
    """Manually trigger sync for all linked accounts."""
    from gateway_modules.services.game_sync.sync_orchestrator import sync_games_for_user
    
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    pool = await get_pool()
    
    # Trigger sync in background and return immediately
    async def run_sync():
        try:
            result = await sync_games_for_user(pool, user_id, session_id, max_games_per_provider=100)
            logger.info(f"Sync completed: {result.total_synced} games synced, {len(result.errors)} errors")
        except Exception as e:
            logger.info(f"Sync error: {e}")
    
    asyncio.create_task(run_sync())
    
    return {
        "message": "Sync triggered",
        "status": "in_progress"
    }
