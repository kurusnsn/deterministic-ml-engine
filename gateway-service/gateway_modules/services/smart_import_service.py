"""
Smart import service that selectively imports only missing games for report generation.
"""

from typing import List, Optional, Dict, Any, AsyncGenerator, Callable
from datetime import datetime
import asyncpg
import httpx
import json
import asyncio

from ..models.repertoire import ImportRequest, DateRange
from .game_checking_service import check_existing_games, GameExistenceFilter, GameGapAnalysis


class ImportProgress:
    """Tracks progress of a smart import operation"""

    def __init__(self):
        self.existing_games: int = 0
        self.newly_imported: int = 0
        self.total_processed: int = 0
        self.status: str = "starting"  # starting, checking, importing, completed, error
        self.message: str = ""
        self.error: Optional[str] = None


class SmartImportResult:
    """Result of a smart import operation"""

    def __init__(self):
        self.success: bool = True
        self.existing_games_count: int = 0
        self.newly_imported_count: int = 0
        self.total_games_available: int = 0
        self.skipped_import: bool = False
        self.error_message: Optional[str] = None
        self.import_summary: str = ""


async def perform_smart_import(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    import_request: ImportRequest,
    date_range: Optional[DateRange] = None,
    force_import: bool = False,
    import_url: str = "http://import:8000",
    progress_callback: Optional[Callable] = None
) -> SmartImportResult:
    """
    Perform smart import - check existing games first, then import only what's missing.

    Args:
        pool: Database connection pool
        user_id: User ID (for authenticated users)
        session_id: Session ID (for anonymous users)
        import_request: Import request with platform/username/filters
        date_range: Optional date range for filtering
        force_import: Force import even if games exist
        import_url: URL of the import service
        progress_callback: Optional callback for progress updates

    Returns:
        SmartImportResult with details of the import operation
    """
    result = SmartImportResult()
    progress = ImportProgress()

    try:
        # Update progress
        progress.status = "checking"
        progress.message = "Checking existing games..."
        if progress_callback:
            await progress_callback(progress)

        # Parse date range if provided
        start_date = None
        end_date = None
        if date_range:
            if date_range.start_date:
                start_date = datetime.fromisoformat(date_range.start_date.replace('Z', '+00:00'))
            if date_range.end_date:
                end_date = datetime.fromisoformat(date_range.end_date.replace('Z', '+00:00'))

        # Check existing games
        filters = GameExistenceFilter(
            platform=import_request.platform,
            username=import_request.username,
            start_date=start_date,
            end_date=end_date,
            time_control=import_request.time_control,
            rated=import_request.rated
        )

        gap_analysis = await check_existing_games(pool, user_id, session_id, filters)
        result.existing_games_count = gap_analysis.existing_games_count

        # Update progress with existing games info
        progress.existing_games = gap_analysis.existing_games_count
        progress.message = "Checking existing games..."
        if progress_callback:
            await progress_callback(progress)

        # Decide whether to import
        if not force_import and not gap_analysis.should_import:
            result.skipped_import = True
            result.total_games_available = gap_analysis.existing_games_count
            result.import_summary = f"Using {gap_analysis.existing_games_count} existing games (no import needed)"
            progress.status = "completed"
            progress.total_processed = gap_analysis.existing_games_count
            progress.message = result.import_summary
            if progress_callback:
                await progress_callback(progress)
            return result

        # Prepare import payload
        import_payload = {
            "source": import_request.platform,
            "username": import_request.username,
            "filters": {
                "max": import_request.max_games
            },
            "normalize": True
        }

        # Add filters to import payload
        if import_request.rated is not None:
            import_payload["filters"]["rated"] = import_request.rated

        if import_request.time_control and import_request.time_control != "All time controls":
            import_payload["filters"]["perfType"] = import_request.time_control.lower()

        # Use gap analysis filters to avoid duplicates
        if gap_analysis.import_filters:
            import_payload["filters"].update(gap_analysis.import_filters)

        # Update progress
        progress.status = "importing"
        progress.message = "Importing..."
        if progress_callback:
            await progress_callback(progress)

        # Perform the import via streaming
        imported_count = await _stream_import_games(
            import_url=import_url,
            payload=import_payload,
            pool=pool,
            user_id=user_id,
            session_id=session_id,
            importing_username=import_request.username,
            progress=progress,
            progress_callback=progress_callback
        )

        result.newly_imported_count = imported_count
        result.total_games_available = result.existing_games_count + result.newly_imported_count

        # Create summary
        if imported_count > 0:
            result.import_summary = f"Using {result.existing_games_count} existing + {imported_count} newly imported games"
        else:
            result.import_summary = f"Using {result.existing_games_count} existing games (no new games available)"

        # Final progress update
        progress.status = "completed"
        progress.newly_imported = imported_count
        progress.total_processed = result.total_games_available
        progress.message = result.import_summary
        if progress_callback:
            await progress_callback(progress)

    except Exception as e:
        result.success = False
        result.error_message = str(e)
        progress.status = "error"
        progress.error = str(e)
        progress.message = f"Import failed: {str(e)}"
        if progress_callback:
            await progress_callback(progress)

    return result


async def _stream_import_games(
    import_url: str,
    payload: Dict[str, Any],
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    importing_username: str,
    progress: ImportProgress,
    progress_callback: Optional[Callable] = None
) -> int:
    """
    Stream games from import service and persist them to database.

    Returns:
        Number of games successfully imported
    """
    imported_count = 0

    try:
        # Use longer timeout for streaming - connect quickly but allow long reads
        timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Use stream() context manager for proper streaming instead of post()
            async with client.stream(
                "POST",
                f"{import_url}/games/fetch/stream",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status_code != 200:
                    text = await response.aread()
                    raise Exception(f"Import service error: {text.decode()}")

                # Process streaming response line by line as they arrive
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue

                    try:
                        game_data = json.loads(line)
                        if game_data and not game_data.get("error"):
                            # Persist game to database
                            success = await _persist_game(pool, game_data, user_id, session_id, importing_username)
                            if success:
                                imported_count += 1
                                progress.newly_imported = imported_count
                                progress.message = "Importing..."
                                if progress_callback:
                                    await progress_callback(progress)

                    except json.JSONDecodeError:
                        # Skip malformed lines
                        continue

    except httpx.TimeoutException as e:
        raise Exception(f"Import timed out after {timeout.read}s: {str(e)}")
    except Exception as e:
        raise Exception(f"Failed to stream import games: {str(e)}")

    return imported_count


async def _persist_game(
    pool: asyncpg.Pool,
    game_data: Dict[str, Any],
    user_id: Optional[str],
    session_id: Optional[str],
    importing_username: Optional[str] = None
) -> bool:
    """
    Persist a single game to the database.

    Returns:
        True if successful, False otherwise
    """
    try:
        # Extract opponent username based on who is importing
        opponent_username = None
        if importing_username:
            white = game_data.get("white", {})
            black = game_data.get("black", {})
            white_name = white.get("username", "") if isinstance(white, dict) else ""
            black_name = black.get("username", "") if isinstance(black, dict) else ""

            # Case-insensitive comparison for username matching
            if white_name.lower() == importing_username.lower():
                opponent_username = black_name
            elif black_name.lower() == importing_username.lower():
                opponent_username = white_name

        query = """
            INSERT INTO games (
                user_id, session_id, provider, source_id, rated, perf, time_control,
                start_time, end_time, result, termination, opening_eco, opening_name,
                url, site, pgn, opponent_username, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()
            )
            ON CONFLICT (provider, source_id) DO UPDATE SET
                rated = EXCLUDED.rated,
                perf = EXCLUDED.perf,
                time_control = EXCLUDED.time_control,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                result = EXCLUDED.result,
                termination = EXCLUDED.termination,
                opening_eco = EXCLUDED.opening_eco,
                opening_name = EXCLUDED.opening_name,
                url = EXCLUDED.url,
                site = EXCLUDED.site,
                pgn = EXCLUDED.pgn,
                opponent_username = EXCLUDED.opponent_username
            RETURNING id
        """

        params = [
            user_id,
            session_id,
            game_data.get("source", game_data.get("provider")),
            game_data.get("id"),
            game_data.get("rated"),
            game_data.get("perf"),
            game_data.get("time_control"),
            datetime.fromtimestamp(game_data["start_time"] / 1000) if game_data.get("start_time") else None,
            datetime.fromtimestamp(game_data["end_time"] / 1000) if game_data.get("end_time") else None,
            game_data.get("result"),
            game_data.get("termination"),
            game_data.get("opening_eco"),
            game_data.get("opening_name"),
            game_data.get("url"),
            game_data.get("site"),
            game_data.get("pgn", ""),
            opponent_username
        ]

        async with pool.acquire() as conn:
            game_id = await conn.fetchval(query, *params)

            if game_id:
                # Record ownership in user_games join table
                if user_id:
                    await conn.execute(
                        "INSERT INTO user_games (user_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        user_id, game_id
                    )
                elif session_id:
                    await conn.execute(
                        "INSERT INTO user_games (session_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        session_id, game_id
                    )

                # Insert player data if game was inserted
                if game_data.get("white") and game_data.get("black"):
                    await _insert_players(conn, game_id, game_data)

            return game_id is not None

    except Exception as e:
        print(f"Error persisting game: {e}")
        return False


async def _insert_players(conn: asyncpg.Connection, game_id: int, game_data: Dict[str, Any]):
    """Insert player data for a game."""
    try:
        # Insert white player
        white = game_data.get("white", {})
        if white.get("username"):
            await conn.execute(
                """
                INSERT INTO players (game_id, color, username, rating, result)
                VALUES ($1, 'white', $2, $3, $4)
                ON CONFLICT DO NOTHING
                """,
                game_id,
                white.get("username"),
                white.get("rating"),
                white.get("result")
            )

        # Insert black player
        black = game_data.get("black", {})
        if black.get("username"):
            await conn.execute(
                """
                INSERT INTO players (game_id, color, username, rating, result)
                VALUES ($1, 'black', $2, $3, $4)
                ON CONFLICT DO NOTHING
                """,
                game_id,
                black.get("username"),
                black.get("rating"),
                black.get("result")
            )

    except Exception as e:
        print(f"Error inserting players: {e}")