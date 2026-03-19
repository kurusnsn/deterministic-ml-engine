"""
Home router - Home dashboard and ratings progress endpoints.
"""

from datetime import datetime as dt, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Query
import asyncpg

from gateway_modules.dependencies import get_pool, get_owner_from_request
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/me", tags=["home"])


@router.get("/home")
async def get_home_dashboard(
    request: Request,
    include_profile: bool = Query(False, description="Include full profile data for /profile page"),
    pool: asyncpg.Pool = Depends(get_pool)
):
    """
    Aggregated home dashboard data for logged-in users.
    
    Returns linked accounts, latest report, recent games, and trainer summary
    in a single request for the home dashboard.
    
    When include_profile=True, also includes:
    - User info (avatar, created_at, puzzle_elo)
    - Activity heatmap data (52 weeks)
    - Rating graphs (game + puzzle series)
    - Full trainer summary with puzzles/PV lines preview
    """
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    try:
        async with pool.acquire() as conn:
            # 1. Fetch linked accounts
            if user_id:
                accounts_rows = await conn.fetch(
                    "SELECT platform, username FROM linked_accounts WHERE user_id = $1 ORDER BY created_at",
                    user_id
                )
            else:
                accounts_rows = await conn.fetch(
                    "SELECT platform, username FROM linked_accounts WHERE session_id = $1 ORDER BY created_at",
                    session_id
                )
            
            # Build linked accounts response
            lichess_account = None
            chesscom_account = None
            for row in accounts_rows:
                if row["platform"] == "lichess.org":
                    lichess_account = row["username"]
                elif row["platform"] == "chess.com":
                    chesscom_account = row["username"]
            
            # Get sync status for last_sync_at
            lichess_sync_at = None
            chesscom_sync_at = None
            if user_id:
                sync_rows = await conn.fetch(
                    """SELECT provider, last_synced_at FROM external_game_sync_state 
                       WHERE user_id = $1""",
                    user_id
                )
            else:
                sync_rows = await conn.fetch(
                    """SELECT provider, last_synced_at FROM external_game_sync_state 
                       WHERE session_id = $1""",
                    session_id
                )
            
            for row in sync_rows:
                if row["provider"] == "lichess":
                    lichess_sync_at = row["last_synced_at"]
                elif row["provider"] == "chesscom":
                    chesscom_sync_at = row["last_synced_at"]
            
            linked_accounts = {
                "lichess": {
                    "connected": lichess_account is not None,
                    "username": lichess_account,
                    "last_sync_at": lichess_sync_at.isoformat() if lichess_sync_at else None
                },
                "chesscom": {
                    "connected": chesscom_account is not None,
                    "username": chesscom_account,
                    "last_sync_at": chesscom_sync_at.isoformat() if chesscom_sync_at else None
                }
            }
            
            # 2. Fetch latest report
            if user_id:
                report_row = await conn.fetchrow(
                    """SELECT id, name, created_at, total_games
                       FROM saved_reports 
                       WHERE user_id = $1 
                       ORDER BY created_at DESC 
                       LIMIT 1""",
                    user_id
                )
            else:
                report_row = await conn.fetchrow(
                    """SELECT id, name, created_at, total_games
                       FROM saved_reports 
                       WHERE session_id = $1 
                       ORDER BY created_at DESC 
                       LIMIT 1""",
                    session_id
                )
            
            if report_row:
                total_games = report_row["total_games"]
                headline = f"Based on {total_games} games" if total_games else None
                latest_report = {
                    "has_report": True,
                    "id": str(report_row["id"]),
                    "name": report_row["name"],
                    "created_at": report_row["created_at"].isoformat() if report_row["created_at"] else None,
                    "headline": headline
                }
            else:
                latest_report = {
                    "has_report": False,
                    "id": None,
                    "name": None,
                    "created_at": None,
                    "headline": None
                }
            
            # 3. Fetch recent games (last 5)
            if user_id:
                games_rows = await conn.fetch(
                    """SELECT id, opponent_username, result, provider, 
                              COALESCE(played_at, start_time, created_at) as game_date
                       FROM games 
                       WHERE user_id = $1 
                       ORDER BY COALESCE(played_at, start_time, created_at) DESC 
                       LIMIT 5""",
                    user_id
                )
            else:
                games_rows = await conn.fetch(
                    """SELECT id, opponent_username, result, provider,
                              COALESCE(played_at, start_time, created_at) as game_date
                       FROM games 
                       WHERE session_id = $1 
                       ORDER BY COALESCE(played_at, start_time, created_at) DESC 
                       LIMIT 5""",
                    session_id
                )
            
            recent_games = []
            for row in games_rows:
                # Map provider to source
                provider = row["provider"] or ""
                if provider.lower() == "lichess":
                    source = "lichess"
                elif provider.lower() == "chess.com":
                    source = "chesscom"
                else:
                    source = "manual"
                
                recent_games.append({
                    "id": str(row["id"]),
                    "played_at": row["game_date"].isoformat() if row["game_date"] else None,
                    "opponent": row["opponent_username"] or "Unknown",
                    "result": row["result"] or "unknown",
                    "source": source
                })
            
            # 4. Fetch trainer summary (lightweight version)
            snapshot_row = None
            trainer_data = {
                "has_trainer_data": False,
                "status": None,
                "headline": None,
                "focus_area": None
            }
            
            # Only check trainer if user is authenticated
            if user_id:
                try:
                    snapshot_row = await conn.fetchrow(
                        """SELECT coach_summary, recommendations, sample_size, updated_at
                           FROM user_memory_snapshots 
                           WHERE user_id = $1 AND time_control = 'all' AND side = 'both'
                           ORDER BY updated_at DESC 
                           LIMIT 1""",
                        user_id
                    )
                    
                    if snapshot_row and snapshot_row["coach_summary"]:
                        coach_summary = snapshot_row["coach_summary"]
                        recommendations = snapshot_row["recommendations"] or {}
                        
                        focus_area = None
                        headline = None
                        
                        if isinstance(recommendations, dict):
                            focus_areas = recommendations.get("focus_areas", [])
                            if focus_areas and len(focus_areas) > 0:
                                focus_area = focus_areas[0] if isinstance(focus_areas[0], str) else focus_areas[0].get("area")
                        
                        if coach_summary:
                            lines = coach_summary.strip().split('\n')
                            headline = lines[0][:100] if lines else None
                        
                        trainer_data = {
                            "has_trainer_data": True,
                            "status": "ready",
                            "headline": headline or f"Based on {snapshot_row['sample_size']} games analyzed",
                            "focus_area": focus_area
                        }
                    else:
                        game_count = await conn.fetchval(
                            "SELECT COUNT(*) FROM user_games WHERE user_id = $1",
                            user_id
                        )
                        if game_count and game_count >= 5:
                            trainer_data["status"] = "available"
                            trainer_data["headline"] = f"Trainer available - {game_count} games to analyze"
                except Exception as e:
                    logger.info(f"Error fetching trainer data: {e}")
            
            # Build base response
            response = {
                "linked_accounts": linked_accounts,
                "latest_report": latest_report,
                "recent_games": recent_games,
                "trainer": trainer_data
            }
            
            # === PROFILE-SPECIFIC DATA (when include_profile=True) ===
            if include_profile:
                response = await _add_profile_data(
                    conn, response, user_id, session_id, 
                    accounts_rows, sync_rows, trainer_data, snapshot_row
                )
            
            return response

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error getting home dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get home dashboard: {str(e)}")


async def _add_profile_data(conn, response, user_id, session_id, accounts_rows, sync_rows, trainer_data, snapshot_row):
    """Add profile-specific data when include_profile=True."""
    
    # User info
    user_info = {
        "id": str(user_id) if user_id else None,
        "avatar_url": None,
        "created_at": None,
        "puzzle_elo": None
    }
    
    if user_id:
        try:
            profile_row = await conn.fetchrow(
                "SELECT profile_picture, created_at FROM users WHERE id = $1",
                user_id
            )
            if profile_row:
                if profile_row.get("profile_picture"):
                    user_info["avatar_url"] = profile_row["profile_picture"]
                if profile_row.get("created_at"):
                    user_info["created_at"] = profile_row["created_at"].isoformat()
        except Exception as e:
            logger.info(f"Error fetching user profile: {e}")
        
        try:
            puzzle_row = await conn.fetchrow(
                "SELECT rating FROM user_puzzle_ratings WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
                user_id
            )
            if puzzle_row:
                user_info["puzzle_elo"] = puzzle_row["rating"]
        except Exception as e:
            logger.info(f"Error fetching puzzle elo: {e}")
    
    response["user"] = user_info
    
    # Expanded linked accounts for profile page
    linked_accounts_list = [
        {"platform": row["platform"], "username": row["username"]}
        for row in accounts_rows
    ]
    response["linked_accounts_list"] = linked_accounts_list
    
    # Sync status for profile page
    sync_status_map = {}
    for row in sync_rows:
        provider = row["provider"]
        sync_status_map[provider] = {
            "username": "",
            "status": row.get("status", "idle") if hasattr(row, 'get') else "idle",
            "last_synced_at": row["last_synced_at"].isoformat() if row["last_synced_at"] else None,
            "games_synced": row.get("games_synced", 0) if hasattr(row, 'get') else 0,
            "error_message": row.get("error_message") if hasattr(row, 'get') else None
        }
    response["sync_status"] = sync_status_map
    
    # Activity heatmap (52 weeks)
    weeks = 52
    try:
        if user_id:
            activity_rows = await conn.fetch(
                """
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM activities
                WHERE user_id = $1
                  AND created_at >= NOW() - INTERVAL '1 week' * $2
                GROUP BY DATE(created_at)
                ORDER BY date
                """,
                user_id, weeks
            )
        else:
            activity_rows = await conn.fetch(
                """
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM activities
                WHERE session_id = $1
                  AND created_at >= NOW() - INTERVAL '1 week' * $2
                GROUP BY DATE(created_at)
                ORDER BY date
                """,
                session_id, weeks
            )
        
        response["activity_heatmap"] = [
            {"date": row["date"].isoformat() if row["date"] else None, "count": row["count"]}
            for row in activity_rows
        ]
    except Exception as e:
        logger.info(f"Error fetching activity heatmap: {e}")
        response["activity_heatmap"] = []
    
    # Rating graphs (90 days)
    from_date = dt.now() - timedelta(days=90)
    
    try:
        if user_id:
            game_rating_rows = await conn.fetch(
                """
                SELECT provider, time_control, rating, recorded_at
                FROM user_rating_snapshots
                WHERE user_id = $1 AND rating_type = 'game' AND recorded_at >= $2
                ORDER BY provider, time_control, recorded_at
                """,
                user_id, from_date
            )
            puzzle_rating_rows = await conn.fetch(
                """
                SELECT provider, time_control, rating, recorded_at
                FROM user_rating_snapshots
                WHERE user_id = $1 AND rating_type = 'puzzle' AND recorded_at >= $2
                ORDER BY provider, recorded_at
                """,
                user_id, from_date
            )
        else:
            game_rating_rows = await conn.fetch(
                """
                SELECT provider, time_control, rating, recorded_at
                FROM user_rating_snapshots
                WHERE session_id = $1 AND rating_type = 'game' AND recorded_at >= $2
                ORDER BY provider, time_control, recorded_at
                """,
                session_id, from_date
            )
            puzzle_rating_rows = await conn.fetch(
                """
                SELECT provider, time_control, rating, recorded_at
                FROM user_rating_snapshots
                WHERE session_id = $1 AND rating_type = 'puzzle' AND recorded_at >= $2
                ORDER BY provider, recorded_at
                """,
                session_id, from_date
            )
        
        # Group game ratings
        game_series_map = {}
        for row in game_rating_rows:
            key = (row["provider"], row["time_control"])
            if key not in game_series_map:
                game_series_map[key] = {
                    "provider": row["provider"],
                    "time_control": row["time_control"],
                    "points": []
                }
            game_series_map[key]["points"].append({
                "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
                "rating": row["rating"]
            })
        
        # Group puzzle ratings
        puzzle_series_map = {}
        for row in puzzle_rating_rows:
            key = row["provider"]
            if key not in puzzle_series_map:
                puzzle_series_map[key] = {
                    "provider": row["provider"],
                    "time_control": "puzzle",
                    "points": []
                }
            puzzle_series_map[key]["points"].append({
                "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
                "rating": row["rating"]
            })
        
        response["ratings"] = {
            "game": {"series": list(game_series_map.values())},
            "puzzle": {"series": list(puzzle_series_map.values())}
        }
    except Exception as e:
        logger.info(f"Error fetching ratings: {e}")
        response["ratings"] = {"game": {"series": []}, "puzzle": {"series": []}}
    
    # Add trainer summary details if available
    if trainer_data.get("has_trainer_data") and snapshot_row:
        try:
            trainer_data["summary"] = {
                "coach_summary": snapshot_row.get("coach_summary"),
                "recommendations": snapshot_row.get("recommendations") or {},
                "raw_stats": snapshot_row.get("raw_stats") or {},
                "sample_size": snapshot_row.get("sample_size"),
                "updated_at": snapshot_row["updated_at"].isoformat() if snapshot_row.get("updated_at") else None
            }
        except Exception as e:
            logger.info(f"Error adding trainer summary: {e}")
    
    return response


@router.get("/ratings/game")
async def get_game_ratings(
    request: Request,
    provider: str = Query("all", description="Provider filter: lichess, chesscom, all"),
    time_control: str = Query("all", description="Time control: bullet, blitz, rapid, classical, all"),
    from_date: str = Query(None, description="Start date ISO format"),
    to_date: str = Query(None, description="End date ISO format"),
    pool: asyncpg.Pool = Depends(get_pool)
):
    """Get game rating progress over time."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    try:
        conditions = ["rating_type = 'game'"]
        params = []
        param_idx = 1
        
        if user_id:
            conditions.append(f"user_id = ${param_idx}")
            params.append(user_id)
            param_idx += 1
        else:
            conditions.append(f"session_id = ${param_idx}")
            params.append(session_id)
            param_idx += 1
        
        if provider and provider != "all":
            conditions.append(f"provider = ${param_idx}")
            params.append(provider)
            param_idx += 1
        
        if time_control and time_control != "all":
            conditions.append(f"time_control = ${param_idx}")
            params.append(time_control)
            param_idx += 1
        
        if from_date:
            try:
                from_dt = dt.fromisoformat(from_date.replace('Z', '+00:00'))
                conditions.append(f"recorded_at >= ${param_idx}")
                params.append(from_dt)
                param_idx += 1
            except ValueError:
                pass
        
        if to_date:
            try:
                to_dt = dt.fromisoformat(to_date.replace('Z', '+00:00'))
                conditions.append(f"recorded_at <= ${param_idx}")
                params.append(to_dt)
                param_idx += 1
            except ValueError:
                pass
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
            SELECT provider, time_control, rating, recorded_at
            FROM user_rating_snapshots
            WHERE {where_clause}
            ORDER BY provider, time_control, recorded_at
        """
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        
        series_map = {}
        for row in rows:
            key = (row["provider"], row["time_control"])
            if key not in series_map:
                series_map[key] = {
                    "provider": row["provider"],
                    "time_control": row["time_control"],
                    "points": []
                }
            series_map[key]["points"].append({
                "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
                "rating": row["rating"]
            })
        
        return {"series": list(series_map.values())}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error getting game ratings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get game ratings: {str(e)}")


@router.get("/ratings/puzzle")
async def get_puzzle_ratings(
    request: Request,
    provider: str = Query("all", description="Provider filter: internal, lichess, chesscom, all"),
    from_date: str = Query(None, description="Start date ISO format"),
    to_date: str = Query(None, description="End date ISO format"),
    pool: asyncpg.Pool = Depends(get_pool)
):
    """Get puzzle rating progress over time."""
    user_id, session_id = get_owner_from_request(request)
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Missing user or session context")
    
    try:
        conditions = ["rating_type = 'puzzle'"]
        params = []
        param_idx = 1
        
        if user_id:
            conditions.append(f"user_id = ${param_idx}")
            params.append(user_id)
            param_idx += 1
        else:
            conditions.append(f"session_id = ${param_idx}")
            params.append(session_id)
            param_idx += 1
        
        if provider and provider != "all":
            conditions.append(f"provider = ${param_idx}")
            params.append(provider)
            param_idx += 1
        
        if from_date:
            try:
                from_dt = dt.fromisoformat(from_date.replace('Z', '+00:00'))
                conditions.append(f"recorded_at >= ${param_idx}")
                params.append(from_dt)
                param_idx += 1
            except ValueError:
                pass
        
        if to_date:
            try:
                to_dt = dt.fromisoformat(to_date.replace('Z', '+00:00'))
                conditions.append(f"recorded_at <= ${param_idx}")
                params.append(to_dt)
                param_idx += 1
            except ValueError:
                pass
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
            SELECT provider, time_control, rating, recorded_at
            FROM user_rating_snapshots
            WHERE {where_clause}
            ORDER BY provider, recorded_at
        """
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        
        series_map = {}
        for row in rows:
            key = row["provider"]
            if key not in series_map:
                series_map[key] = {
                    "provider": row["provider"],
                    "time_control": "puzzle",
                    "points": []
                }
            series_map[key]["points"].append({
                "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None,
                "rating": row["rating"]
            })
        
        return {"series": list(series_map.values())}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"Error getting puzzle ratings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get puzzle ratings: {str(e)}")
