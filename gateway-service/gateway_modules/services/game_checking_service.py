"""
Service for checking game existence and implementing selective import logic.
"""

from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
import asyncpg


class GameExistenceFilter:
    """Filters to check for existing games before importing"""

    def __init__(self,
                 platform: str,
                 username: str,
                 start_date: Optional[datetime] = None,
                 end_date: Optional[datetime] = None,
                 time_control: Optional[str] = None,
                 rated: Optional[bool] = None):
        self.platform = platform
        self.username = username
        self.start_date = start_date
        self.end_date = end_date
        self.time_control = time_control
        self.rated = rated


class GameGapAnalysis:
    """Result of analyzing what games exist vs what needs to be imported"""

    def __init__(self):
        self.existing_games_count: int = 0
        self.missing_games_estimated: int = 0
        self.date_ranges_to_import: List[Tuple[datetime, datetime]] = []
        self.last_game_date: Optional[datetime] = None
        self.should_import: bool = True
        self.import_filters: Dict[str, Any] = {}


async def check_existing_games(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    filters: GameExistenceFilter
) -> GameGapAnalysis:
    """
    Check what games already exist for the given filters and determine what needs to be imported.

    Args:
        pool: Database connection pool
        user_id: User ID (for authenticated users)
        session_id: Session ID (for anonymous users)
        filters: Filters defining what games to check for

    Returns:
        GameGapAnalysis with information about existing games and import needs
    """
    analysis = GameGapAnalysis()

    # Build query to check existing games
    base_query = """
        SELECT g.*, p1.username as white_username, p2.username as black_username
        FROM games g
        JOIN user_games ug ON g.id = ug.game_id
        LEFT JOIN players p1 ON g.id = p1.game_id AND p1.color = 'white'
        LEFT JOIN players p2 ON g.id = p2.game_id AND p2.color = 'black'
    """

    conditions = []
    params = []
    param_count = 0

    # Add user/session filter
    if user_id:
        param_count += 1
        conditions.append(f"ug.user_id = ${param_count}")
        params.append(user_id)
    elif session_id:
        param_count += 1
        conditions.append(f"ug.session_id = ${param_count}")
        params.append(session_id)
    else:
        analysis.should_import = False
        return analysis

    # Add platform filter
    if filters.platform:
        param_count += 1
        conditions.append(f"g.provider = ${param_count}")
        params.append(filters.platform)

    # Add username filter - check both white and black players
    if filters.username:
        param_count += 1
        username_param = f"${param_count}"
        params.append(filters.username)
        param_count += 1
        username_param2 = f"${param_count}"
        params.append(filters.username)
        conditions.append(f"(p1.username = {username_param} OR p2.username = {username_param2})")

    # Add date range filters
    if filters.start_date:
        param_count += 1
        conditions.append(f"g.start_time >= ${param_count}")
        params.append(filters.start_date)

    if filters.end_date:
        param_count += 1
        conditions.append(f"g.start_time <= ${param_count}")
        params.append(filters.end_date)

    # Add time control filter
    if filters.time_control and filters.time_control != 'All time controls':
        param_count += 1
        conditions.append(f"g.perf = ${param_count}")
        params.append(filters.time_control.lower())

    # Add rated filter
    if filters.rated is not None:
        param_count += 1
        conditions.append(f"g.rated = ${param_count}")
        params.append(filters.rated)

    # Construct full query
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    query = base_query + where_clause + " ORDER BY g.start_time DESC"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        existing_games = [dict(row) for row in rows]

    analysis.existing_games_count = len(existing_games)

    if existing_games:
        # Find the most recent game date
        analysis.last_game_date = max(
            game['start_time'] for game in existing_games
            if game['start_time'] is not None
        )

    # Determine if we should import based on existing games
    # For now, always suggest import if we have fewer than expected
    # This could be enhanced with more sophisticated gap detection
    if analysis.existing_games_count < 10:  # Threshold for "enough" games
        analysis.should_import = True
        analysis.missing_games_estimated = max(0, 50 - analysis.existing_games_count)  # Rough estimate

        # Set import filters to get only newer games if we have some
        analysis.import_filters = {
            'platform': filters.platform,
            'username': filters.username,
        }

        if filters.rated is not None:
            analysis.import_filters['rated'] = filters.rated
        if filters.time_control and filters.time_control != 'All time controls':
            analysis.import_filters['time_control'] = filters.time_control

        # If we have recent games, only import newer ones
        if analysis.last_game_date:
            analysis.import_filters['since'] = int(analysis.last_game_date.timestamp() * 1000)

        # Add date range if specified
        if filters.start_date:
            analysis.import_filters['since'] = max(
                analysis.import_filters.get('since', 0),
                int(filters.start_date.timestamp() * 1000)
            )
        if filters.end_date:
            analysis.import_filters['until'] = int(filters.end_date.timestamp() * 1000)
    else:
        analysis.should_import = False
        analysis.missing_games_estimated = 0

    return analysis


async def get_game_count_by_filters(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    platform: str,
    username: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    time_control: Optional[str] = None,
    rated: Optional[bool] = None
) -> int:
    """
    Get count of existing games matching the specified filters.

    Args:
        pool: Database connection pool
        user_id: User ID (for authenticated users)
        session_id: Session ID (for anonymous users)
        platform: Game platform (lichess.org, chess.com)
        username: Username to filter by
        start_date: Optional start date filter
        end_date: Optional end date filter
        time_control: Optional time control filter
        rated: Optional rated games filter

    Returns:
        Count of matching games
    """
    filters = GameExistenceFilter(
        platform=platform,
        username=username,
        start_date=start_date,
        end_date=end_date,
        time_control=time_control,
        rated=rated
    )

    analysis = await check_existing_games(pool, user_id, session_id, filters)
    return analysis.existing_games_count


def should_skip_import(analysis: GameGapAnalysis, min_threshold: int = 10) -> bool:
    """
    Determine if import should be skipped based on existing games analysis.

    Args:
        analysis: Game gap analysis result
        min_threshold: Minimum number of games to consider "enough"

    Returns:
        True if import should be skipped, False if import is needed
    """
    return analysis.existing_games_count >= min_threshold