"""
Main repertoire analysis service that orchestrates the complete analysis pipeline.
"""

from typing import List, Optional, Dict, Any, Callable
from datetime import datetime, timezone
from collections import defaultdict
import re
import asyncpg
import os

from ..models.repertoire import (
    RepertoireReport,
    RepertoireAnalysisRequest,
    SuggestedRepertoire,
    RepertoireBucket,
    RepertoireBucketOpening,
)
from .smart_import_service import perform_smart_import, SmartImportResult, ImportProgress
from .opening_analyzer import (
    aggregate_by_eco_and_color,
    get_user_identifier_from_games,
    separate_by_color,
    NormalizedGame,
    PlayerInfo,
    calculate_game_duration,
    determine_user_color_and_result
)
from .repertoire_classifier import (
    classify_repertoire,
    generate_insights,
    filter_empty_categories
)
from .move_analysis_pipeline import analyze_game_moves
from .line_clustering_service import cluster_games_by_line
from .weak_line_service import analyze_weak_lines
from .puzzle_generation_service import generate_puzzle_from_blunder
from .tactical_insights_service import (
    generate_tactical_insights,
    compute_mistake_motifs,
    compute_defensive_motifs
)
from .user_repertoire_service import UserRepertoireService
from .highlight_extraction_service import extract_highlights
from .playstyle_service import compute_playstyle_profile, annotate_openings_with_style, build_repertoire_fit


def parse_clock_times_from_pgn(pgn: Optional[str]) -> Dict[str, List[int]]:
    """
    Parse [%clk H:MM:SS] or [%clk MM:SS] annotations from PGN.
    Returns dict with 'white' and 'black' lists of clock times in seconds.
    Clock annotations appear after each move in order (white, black, white, black, ...).
    """
    if not pgn:
        return {"white": [], "black": []}
    
    # Match [%clk H:MM:SS] or [%clk MM:SS] patterns
    matches = re.findall(r'\[%clk\s+(?:(\d+):)?(\d+):(\d+)\]', pgn)
    times = []
    for match in matches:
        h = int(match[0]) if match[0] else 0
        m = int(match[1])
        s = int(match[2])
        times.append(h * 3600 + m * 60 + s)
    
    # Alternating: index 0, 2, 4... = white; index 1, 3, 5... = black
    white = [times[i] for i in range(0, len(times), 2)]
    black = [times[i] for i in range(1, len(times), 2)]
    
    return {"white": white, "black": black}


def calculate_avg_move_time_from_pgn(pgn: Optional[str], user_color: Optional[str]) -> Optional[float]:
    """
    Calculate average seconds spent per move from PGN clock annotations.
    Time spent on move N = clock after move N-1 minus clock after move N.
    
    Args:
        pgn: PGN string that may contain [%clk] annotations
        user_color: 'white' or 'black'
        
    Returns:
        Average time in seconds per move, or None if no clock data
    """
    if not user_color:
        return None
        
    clock_times = parse_clock_times_from_pgn(pgn)
    times = clock_times.get(user_color, [])
    
    if len(times) < 2:
        return None
    
    # Time spent = previous_clock - current_clock
    # (ignoring increment which would show negative diff)
    time_spent = []
    for i in range(1, len(times)):
        diff = times[i-1] - times[i]
        if diff > 0:  # Ignore negative diffs (due to increment)
            time_spent.append(diff)
    
    if not time_spent:
        return None
        
    return sum(time_spent) / len(time_spent)


def compute_eval_swing_by_ply(move_analyses_by_game: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Aggregate evaluation stats per ply across all games.
    Returns sorted list of datapoints with avg_eval, avg_cp_loss, and mistake counts.
    Only includes plys with >= 5 samples.
    """
    ply_data = defaultdict(lambda: {
        "evals": [],
        "deltas": [],
        "blunders": 0,
        "mistakes": 0,
        "inaccuracies": 0,
        "count": 0
    })

    for game_id, moves in move_analyses_by_game.items():
        for move in moves:
            ply = move.get("ply")
            if ply is None:
                continue

            # Eval (convert None/mate to capped values if needed, but for now skip complex mate logic 
            # or assume pure CP is sufficient for average. Generally average eval with mate is tricky)
            eval_cp = move.get("eval", {}).get("cp")
            if eval_cp is not None:
                ply_data[ply]["evals"].append(eval_cp)

            # Delta
            eval_delta = move.get("eval_delta")
            if eval_delta is not None:
                ply_data[ply]["deltas"].append(eval_delta)

            # Mistakes
            mistake = move.get("mistake_type")
            if mistake == "blunder":
                ply_data[ply]["blunders"] += 1
            elif mistake == "mistake":
                ply_data[ply]["mistakes"] += 1
            elif mistake == "inaccuracy":
                ply_data[ply]["inaccuracies"] += 1
            
            ply_data[ply]["count"] += 1

    aggregated = []
    for ply, stats in ply_data.items():
        if stats["count"] < 5:
            continue
        
        avg_eval = sum(stats["evals"]) / len(stats["evals"]) / 100.0 if stats["evals"] else 0.0
        avg_cp_loss = sum(stats["deltas"]) / len(stats["deltas"]) / 100.0 if stats["deltas"] else 0.0
        
        aggregated.append({
            "ply": ply,
            "avg_eval": avg_eval,
            "avg_cp_loss": avg_cp_loss,
            "blunders": stats["blunders"],
            "mistakes": stats["mistakes"],
            "inaccuracies": stats["inaccuracies"],
            "sample_size": stats["count"]
        })

    return sorted(aggregated, key=lambda x: x["ply"])


def generate_eval_swing_insights(aggregated_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate insights based on aggregated eval swing data.
    Detects critical plys where average evaluation drops significantly.
    """
    insights = []
    
    # Threshold for significant loss (in pawns)
    THRESHOLD = -0.3
    
    # Store drops as (ply, effective_loss)
    drops = []
    
    for pt in aggregated_data:
        ply = pt["ply"]
        delta = pt["avg_cp_loss"]
        
        # Determine effective loss (negative value = bad for user)
        # White (odd ply): delta is (After - Before). If negative, White lost eval.
        # Black (even ply): delta is (After - Before). If positive, White gained eval (Black lost).
        if ply % 2 == 1: # White move
            effective_loss = delta
        else: # Black move
            effective_loss = -delta
            
        if effective_loss < THRESHOLD:
            drops.append((ply, effective_loss))

    # Sort drops by severity (most negative first)
    drops.sort(key=lambda x: x[1])
    
    if drops:
        # Take the worst 3
        top_drops = drops[:3]
        
        # Generic insight for the worst drop
        worst_ply, worst_loss = top_drops[0]
        insights.append({
            "type": "eval_swing",
            "priority": "high" if worst_loss < -0.7 else "medium",
            "message": f"Your largest average eval drops occur around ply {worst_ply} ({worst_loss:.2f} pawns). Review lines reaching this position."
        })
        
        # Check for midgame collapse (approx ply 15-30)
        midgame_issues = [d for d in drops if 15 <= d[0] <= 30]
        if len(midgame_issues) >= 2:
            insights.append({
                "type": "eval_swing",
                "priority": "medium",
                "message": "You tend to lose evaluation in the midgame (ply 15-30). Focus on middle game plans."
            })

    return insights



async def get_user_games(
    pool: asyncpg.Pool,
    user_id: Optional[str],
    session_id: Optional[str],
    usernames: Optional[List[str]] = None,
    max_games: Optional[int] = None,
    time_control: Optional[str] = None
) -> List[dict]:
    """
    Fetch user games from the database, optionally filtered by specific usernames.

    Args:
        pool: Database connection pool
        user_id: User ID (for authenticated users)
        session_id: Session ID (for anonymous users)
        usernames: Optional list of usernames to filter by (for multi-account support)
        max_games: Maximum number of games to return (default: 1000)
        time_control: Optional time control filter (bullet, blitz, rapid, classical)

    Returns:
        List of game dictionaries
    """
    base_query = """
        SELECT g.*, p1.username as white_username, p1.rating as white_rating, p1.result as white_result,
               p2.username as black_username, p2.rating as black_rating, p2.result as black_result
        FROM games g
        JOIN user_games ug ON g.id = ug.game_id
        LEFT JOIN players p1 ON g.id = p1.game_id AND p1.color = 'white'
        LEFT JOIN players p2 ON g.id = p2.game_id AND p2.color = 'black'
    """

    conditions = []
    params = []
    param_count = 0

    # Add user/session filter - check both for logged-in users
    # This ensures users see games imported before and after login
    if user_id and session_id:
        param_count += 1
        user_param = param_count
        params.append(user_id)
        param_count += 1
        session_param = param_count
        params.append(session_id)
        conditions.append(f"(ug.user_id = ${user_param} OR ug.session_id = ${session_param})")
    elif user_id:
        param_count += 1
        conditions.append(f"ug.user_id = ${param_count}")
        params.append(user_id)
    elif session_id:
        param_count += 1
        conditions.append(f"ug.session_id = ${param_count}")
        params.append(session_id)
    else:
        return []

    # Add username filter if specified (case-insensitive)
    if usernames:
        # Filter for games where either white or black player is in the usernames list
        username_placeholders = []
        for username in usernames:
            param_count += 1
            username_placeholders.append(f"${param_count}")
            params.append(username.lower())  # Lowercase for case-insensitive match

        username_filter = f"(LOWER(p1.username) IN ({','.join(username_placeholders)}) OR LOWER(p2.username) IN ({','.join(username_placeholders)}))"
        conditions.append(username_filter)

    # Add time control filter if specified
    if time_control:
        tc_lower = time_control.lower()
        # Filter based on time_control column matching the category
        # Time controls may be stored as "300+0" or "180+2" format, or as labels like "blitz"
        # Use COALESCE and safe parsing to handle null/malformed values
        if tc_lower == "bullet":
            # Bullet: base time < 3 minutes (180 seconds)
            conditions.append("""(
                (g.time_control ~ '^[0-9]+' AND CAST(SPLIT_PART(g.time_control, '+', 1) AS INTEGER) < 180)
                OR g.time_control ILIKE '%bullet%'
            )""")
        elif tc_lower == "blitz":
            # Blitz: base time 3-9 minutes (180-540 seconds)
            conditions.append("""(
                (g.time_control ~ '^[0-9]+' AND CAST(SPLIT_PART(g.time_control, '+', 1) AS INTEGER) BETWEEN 180 AND 540)
                OR g.time_control ILIKE '%blitz%'
            )""")
        elif tc_lower == "rapid":
            # Rapid: base time 10-30 minutes (600-1800 seconds)
            conditions.append("""(
                (g.time_control ~ '^[0-9]+' AND CAST(SPLIT_PART(g.time_control, '+', 1) AS INTEGER) BETWEEN 600 AND 1800)
                OR g.time_control ILIKE '%rapid%'
            )""")
        elif tc_lower == "classical":
            # Classical: base time > 30 minutes (1800 seconds)
            conditions.append("""(
                (g.time_control ~ '^[0-9]+' AND CAST(SPLIT_PART(g.time_control, '+', 1) AS INTEGER) > 1800)
                OR g.time_control ILIKE '%classical%'
            )""")

    # Construct full query with limit
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    limit = max_games if max_games and max_games > 0 else 1000
    query = base_query + where_clause + f" ORDER BY g.created_at DESC LIMIT {limit}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [dict(row) for row in rows]


def convert_db_games_to_normalized(db_games: List[dict]) -> List[NormalizedGame]:
    """
    Convert database game records to NormalizedGame objects.

    Args:
        db_games: List of game dictionaries from database

    Returns:
        List of NormalizedGame objects
    """
    normalized_games = []

    for game_data in db_games:
        try:
            # Create PlayerInfo objects

            white_player = PlayerInfo(
                username=game_data.get('white_username'),
                rating=game_data.get('white_rating'),
                result=game_data.get('white_result'),
                color='white'
            )

            black_player = PlayerInfo(
                username=game_data.get('black_username'),
                rating=game_data.get('black_rating'),
                result=game_data.get('black_result'),
                color='black'
            )

            # Create NormalizedGame object
            normalized_game = NormalizedGame(
                source=game_data.get('provider', 'unknown'),
                id=str(game_data.get('source_id', game_data.get('id', ''))),
                url=game_data.get('url'),
                site=game_data.get('site'),
                rated=game_data.get('rated'),
                perf=game_data.get('perf'),
                time_control=game_data.get('time_control'),
                start_time=int(game_data['start_time'].timestamp() * 1000) if game_data.get('start_time') else None,
                end_time=int(game_data['end_time'].timestamp() * 1000) if game_data.get('end_time') else None,
                white=white_player,
                black=black_player,
                result=game_data.get('result'),
                termination=game_data.get('termination'),
                opening_name=game_data.get('opening_name'),
                opening_eco=game_data.get('opening_eco'),
                pgn=game_data.get('pgn')
            )

            normalized_games.append(normalized_game)

        except Exception as e:
            # Log error but continue processing other games
            print(f"Error converting game {game_data.get('id', 'unknown')}: {str(e)}")
            continue

    return normalized_games


def count_moves_from_pgn(pgn: Optional[str]) -> Optional[int]:
    """Approximate the number of full moves in a PGN string."""
    if not pgn:
        return None

    # Remove comments and annotations to avoid counting them as moves
    cleaned = re.sub(r"\{[^}]*\}", " ", pgn)
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)

    move_numbers = re.findall(r"\b(\d+)\.\s*", cleaned)
    if move_numbers:
        return int(move_numbers[-1])

    # Fallback: count occurrences of move tokens (split by spaces)
    tokens = [token for token in cleaned.split() if token and not token[0].isdigit()]
    if tokens:
        return max(1, len(tokens) // 2)

    return None


TIME_CONTROL_BUCKETS = [
    {"key": "bullet", "label": "Bullet (<3 min)", "max_seconds": 180},
    {"key": "blitz", "label": "Blitz (3-10 min)", "max_seconds": 600},
    {"key": "rapid", "label": "Rapid (10-30 min)", "max_seconds": 1800},
    {"key": "classical", "label": "Classical (30+ min)", "max_seconds": None},
]


def parse_time_control_string(time_control: Optional[str]) -> Optional[int]:
    if not time_control:
        return None

    lower = time_control.lower()

    plus_match = re.match(r"(\d+)(?:\+(\d+))?", lower)
    if plus_match:
        return int(plus_match.group(1))

    if "bullet" in lower:
        return 120
    if "blitz" in lower:
        return 300
    if "rapid" in lower:
        return 900
    if "classical" in lower or "standard" in lower:
        return 1800

    return None


def classify_time_control(time_control: Optional[str], duration_seconds: Optional[int]) -> tuple[str, str]:
    base_seconds = parse_time_control_string(time_control)

    if base_seconds is None and duration_seconds:
        base_seconds = duration_seconds

    if base_seconds is None:
        return "unknown", "Unknown"

    for bucket in TIME_CONTROL_BUCKETS:
        max_seconds = bucket["max_seconds"]
        if max_seconds is None or base_seconds < max_seconds:
            return bucket["key"], bucket["label"]

    return "unknown", "Unknown"


def analyze_games_for_summary(games: List[NormalizedGame], user_identifier: str) -> Dict[str, Any]:
    """Compute result breakdown, time usage, and game length histograms."""
    result_counts = {"win": 0, "loss": 0, "draw": 0}
    time_usage_entries: List[Dict[str, Any]] = []
    histogram_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: {"win": 0, "loss": 0, "draw": 0})
    time_control_summary: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "label": "Unknown",
        "games": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "total_moves": 0,
        "total_duration": 0,
        "move_samples": 0,
        "time_samples": 0,
        "losses_on_time": 0,
    })

    buckets = [
        (0, 20, "0-20"),
        (21, 40, "21-40"),
        (41, 60, "41-60"),
        (61, 80, "61-80"),
        (81, None, "81+")
    ]

    def bucket_label_for_moves(moves: Optional[int]) -> str:
        if moves is None:
            return "Unknown"
        for lower, upper, label in buckets:
            if upper is None and moves >= lower:
                return label
            if upper is not None and lower <= moves <= upper:
                return label
        return "Unknown"

    for idx, game in enumerate(games):
        user_color, user_result = determine_user_color_and_result(game, user_identifier)
        if not user_result:
            continue

        result_counts[user_result] = result_counts.get(user_result, 0) + 1

        moves = count_moves_from_pgn(getattr(game, 'pgn', None))
        duration = calculate_game_duration(getattr(game, 'start_time', None), getattr(game, 'end_time', None))
        
        # Try to calculate avg move time from PGN clock annotations first (more accurate)
        pgn = getattr(game, 'pgn', None)
        avg_move_time = calculate_avg_move_time_from_pgn(pgn, user_color)
        
        # Fallback: calculate from game duration if no clock data in PGN
        if avg_move_time is None and duration and moves and moves > 0:
            avg_move_time = duration / moves


        termination_text = (game.termination or "").lower() if hasattr(game, 'termination') else ""
        lost_on_time = user_result == "loss" and any(keyword in termination_text for keyword in ["time", "flag", "clock"])

        bucket_key, bucket_label_desc = classify_time_control(getattr(game, 'time_control', None), duration)
        bucket_stats = time_control_summary[bucket_key]
        bucket_stats["label"] = bucket_label_desc
        bucket_stats["games"] += 1
        bucket_stats["wins"] += 1 if user_result == "win" else 0
        bucket_stats["losses"] += 1 if user_result == "loss" else 0
        bucket_stats["draws"] += 1 if user_result == "draw" else 0
        if moves:
            bucket_stats["total_moves"] += moves
            bucket_stats["move_samples"] += 1
        if duration:
            bucket_stats["total_duration"] += duration
            bucket_stats["time_samples"] += 1
        if lost_on_time:
            bucket_stats["losses_on_time"] += 1

        bucket = bucket_label_for_moves(moves)
        histogram_counts[bucket][user_result] = histogram_counts[bucket].get(user_result, 0) + 1

        entry: Dict[str, Any] = {
            "game_id": str(getattr(game, 'id', idx) or idx),
            "opening": getattr(game, 'opening_name', None) or getattr(game, 'opening_eco', 'Unknown'),
            "moves": moves,
            "duration": duration,
            "avg_move_time": avg_move_time,
            "result": user_result,
            "lost_on_time": lost_on_time,
            "time_control": bucket_key,
            "time_control_label": bucket_label_desc,
            "color": user_color,
        }

        end_time = getattr(game, 'end_time', None)
        if end_time:
            try:
                entry['end_time'] = datetime.fromtimestamp(end_time / 1000, tz=timezone.utc).isoformat()
            except Exception:
                entry['end_time'] = None

        time_usage_entries.append(entry)

    histogram_list = []
    for lower, upper, label in buckets:
        counts = histogram_counts.get(label, {"win": 0, "loss": 0, "draw": 0})
        histogram_list.append({
            "bucket": label,
            "wins": counts.get("win", 0),
            "losses": counts.get("loss", 0),
            "draws": counts.get("draw", 0)
        })

    if histogram_counts.get("Unknown"):
        unknown_counts = histogram_counts["Unknown"]
        histogram_list.append({
            "bucket": "Unknown",
            "wins": unknown_counts.get("win", 0),
            "losses": unknown_counts.get("loss", 0),
            "draws": unknown_counts.get("draw", 0)
        })

    breakdown_list = []
    for bucket_def in TIME_CONTROL_BUCKETS + [{"key": "unknown", "label": "Unknown"}]:
        key = bucket_def["key"]
        stats = time_control_summary.get(key)
        if not stats or stats["games"] == 0:
            continue
        avg_moves = stats["total_moves"] / stats["move_samples"] if stats["move_samples"] else None
        avg_move_time_seconds = None
        if stats["time_samples"]:
            # Average duration per move sample if available
            total_avg_move_time = 0
            # We don't store per-game avg separately; approximate using total duration / total_moves
            if stats["total_moves"]:
                avg_move_time_seconds = stats["total_duration"] / stats["total_moves"]

        breakdown_list.append({
            "key": key,
            "label": stats.get("label", bucket_def["label"]),
            "games": stats["games"],
            "wins": stats["wins"],
            "losses": stats["losses"],
            "draws": stats["draws"],
            "losses_on_time": stats["losses_on_time"],
            "average_moves": avg_moves,
            "average_move_time": avg_move_time_seconds,
        })

    return {
        "result_breakdown": result_counts,
        "time_usage": time_usage_entries,
        "game_length_histogram": histogram_list,
        "time_control_breakdown": breakdown_list
    }

def generate_suggested_repertoires(
    white_repertoire: Dict[str, Any],
    black_repertoire: Dict[str, Any]
) -> List[SuggestedRepertoire]:
    """
    Generate a list of suggested repertoires from the classified repertoires.
    """
    suggestions = []

    # Suggestion for Core White Repertoire
    if 'core' in white_repertoire and white_repertoire['core'].openings:
        core_white = white_repertoire['core']
        suggestions.append(SuggestedRepertoire(
            name="Core White Repertoire",
            description=f"Your main openings as White, based on {core_white.total_games} games.",
            eco_codes=[op.eco_code for op in core_white.openings],
            openings=core_white.openings
        ))

    # Suggestion for Core Black Repertoire
    if 'core' in black_repertoire and black_repertoire['core'].openings:
        core_black = black_repertoire['core']
        suggestions.append(SuggestedRepertoire(
            name="Core Black Repertoire",
            description=f"Your main openings as Black, based on {core_black.total_games} games.",
            eco_codes=[op.eco_code for op in core_black.openings],
            openings=core_black.openings
        ))

    return suggestions


def map_category_to_repertoire_tag(category: str) -> Optional[str]:
    """
    Map statistical classification category to an auto repertoire bucket.
    """
    if category == "core":
        return "core"
    if category in ("expansion", "developing"):
        return "secondary"
    if category == "experimental":
        return "experimental"
    if category == "repair":
        return "repair"
    return None


async def generate_repertoire_report(
    pool: asyncpg.Pool,
    request: RepertoireAnalysisRequest,
    progress_callback: Optional[callable] = None
) -> Optional[RepertoireReport]:
    """
    Generate a complete repertoire analysis report for a user.

    Args:
        pool: Database connection pool
        request: Analysis request with user identification and parameters

    Returns:
        Complete RepertoireReport or None if insufficient data
    """
    # Fetch user games from database (respect max_games limit and time_control filter from import request)
    max_games = request.import_request.max_games if request.import_request else None
    time_control_filter = request.import_request.time_control if request.import_request else None

    if request.import_request and not request.usernames:
        import_username = request.import_request.username.strip()
        if import_username:
            request.usernames = [import_username]
    
    # Debug: Log filter parameters
    print(f"[ReportGen] user_id={request.user_id}, session_id={request.session_id}")
    print(f"[ReportGen] usernames filter: {request.usernames}")
    print(f"[ReportGen] time_control filter: {time_control_filter}, max_games: {max_games}")
    
    db_games = await get_user_games(
        pool, request.user_id, request.session_id, request.usernames, 
        max_games, time_control_filter
    )
    
    print(f"[ReportGen] Fetched {len(db_games) if db_games else 0} games from database")

    if not db_games:
        return None

    # Convert to NormalizedGame objects
    normalized_games = convert_db_games_to_normalized(db_games)

    if len(normalized_games) < request.min_games:
        return None

    # Determine user identifier for game analysis
    user_identifier = None
    if request.user_id:
        # For authenticated users, try to find their username in games
        user_identifier = get_user_identifier_from_games(normalized_games)
    else:
        # For session users, use the most common username
        user_identifier = get_user_identifier_from_games(normalized_games)

    if not user_identifier:
        return None

    # Fetch user-managed repertoires (if authenticated user)
    user_repertoires: list[RepertoireBucket] = []
    if request.user_id:
        try:
            user_repertoires = await UserRepertoireService.get_user_repertoires(pool, request.user_id)
        except Exception as e:
            print(f"Warning: failed to fetch user repertoires: {e}")

    # NEW: Move analysis pipeline with performance monitoring
    import time
    import asyncio
    
    stockfish_url = os.getenv("STOCKFISH_URL", "http://stockfish:5000")
    move_analyses_by_game = {}
    puzzles = []
    
    # Performance metrics
    perf_metrics = {
        "stockfish_calls": 0,
        "stockfish_time": 0.0,
        "heuristics_time": 0.0,
        "clustering_time": 0.0,
        "total_games": len(normalized_games)
    }
    
    # Create mapping from game_id to ECO code for puzzle linking
    game_id_to_eco = {str(game.id): game.opening_eco for game in normalized_games if game.opening_eco}
    
    # Determine max moves per game (default 40, configurable)
    max_moves_per_game = getattr(request, 'max_moves_per_game', 40)
    total_games = len(normalized_games)
    games_completed = 0
    progress_lock = asyncio.Lock()

    async def report_progress():
        nonlocal games_completed
        if progress_callback:
            progress = ImportProgress()
            progress.status = "analyzing"
            progress.total_processed = games_completed
            progress.message = "Analyzing..."
            await progress_callback(progress)
    
    # Async batch processing for large reports (>50 games)
    if len(normalized_games) > 50:
        batch_size = 5  # Process 5 games concurrently
        semaphore = asyncio.Semaphore(batch_size)
        
        async def analyze_game_with_semaphore(game):
            nonlocal games_completed  # Fix scoping for closure variable
            async with semaphore:
                try:
                    start_time = time.perf_counter()
                    move_analyses = await analyze_game_moves(
                        game, user_identifier, stockfish_url, pool, 
                        max_moves=max_moves_per_game,
                        progress_callback=progress_callback
                    )
                    perf_metrics["stockfish_time"] += time.perf_counter() - start_time
                    perf_metrics["stockfish_calls"] += len(move_analyses)

                    # Update progress safely
                    async with progress_lock:
                        games_completed += 1
                        await report_progress()

                    return str(game.id), move_analyses
                except Exception as e:
                    print(f"Error analyzing moves for game {game.id}: {e}")
                    return str(game.id), []
        
        # Process games in batches
        tasks = [analyze_game_with_semaphore(game) for game in normalized_games]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for result in results:
            if isinstance(result, Exception):
                print(f"[PuzzleGen] Result was exception: {result}")
                continue
            game_id, move_analyses = result
            move_analyses_by_game[game_id] = move_analyses
            
            # Debug: Log move_analyses info
            if move_analyses:
                mistake_types = [m.get("mistake_type") for m in move_analyses if m.get("mistake_type")]
                if mistake_types:
                    print(f"[PuzzleGen] Game {game_id}: {len(move_analyses)} moves, mistakes: {mistake_types}")
            
            # Debug: Count blunders and mistakes in this game
            puzzle_moves = [m for m in move_analyses if m.get("mistake_type") in ("blunder", "mistake")]
            if puzzle_moves:
                print(f"[PuzzleGen] Game {game_id}: Found {len(puzzle_moves)} puzzle candidates (blunders/mistakes)")
            
            # Generate puzzles from blunders AND mistakes (for better puzzle coverage)
            for move_analysis in move_analyses:
                mistake_type = move_analysis.get("mistake_type")
                if mistake_type in ("blunder", "mistake"):
                    puzzle = generate_puzzle_from_blunder(
                        game_id=game_id,
                        move_ply=move_analysis["ply"],
                        fen_before=move_analysis["fen_before"],
                        eval_data=move_analysis["eval"],
                        heuristics=move_analysis["heuristics"],
                        mistake_move=move_analysis["move"],
                        eco=game_id_to_eco.get(game_id)
                    )
                    # Add mistake_type to puzzle for display
                    puzzle["mistake_type"] = mistake_type
                    puzzle["move_number"] = (move_analysis["ply"] + 1) // 2
                    puzzles.append(puzzle)
                    print(f"[PuzzleGen] Generated puzzle from {mistake_type} in game {game_id} ply {move_analysis['ply']}")
    else:
        # Sequential processing for smaller reports
        for game in normalized_games:
            try:
                start_time = time.perf_counter()
                move_analyses = await analyze_game_moves(
                    game, user_identifier, stockfish_url, pool, 
                    max_moves=max_moves_per_game,
                    progress_callback=progress_callback
                )
                perf_metrics["stockfish_time"] += time.perf_counter() - start_time
                perf_metrics["stockfish_calls"] += len(move_analyses)
                
                move_analyses_by_game[str(game.id)] = move_analyses

                # Update progress
                games_completed += 1
                await report_progress()

                # Generate puzzles from blunders AND mistakes
                for move_analysis in move_analyses:
                    mistake_type = move_analysis.get("mistake_type")
                    if mistake_type in ("blunder", "mistake"):
                        puzzle = generate_puzzle_from_blunder(
                            game_id=str(game.id),
                            move_ply=move_analysis["ply"],
                            fen_before=move_analysis["fen_before"],
                            eval_data=move_analysis["eval"],
                            heuristics=move_analysis["heuristics"],
                            mistake_move=move_analysis["move"],
                            eco=game.opening_eco
                        )
                        puzzle["mistake_type"] = mistake_type
                        puzzle["move_number"] = (move_analysis["ply"] + 1) // 2
                        puzzles.append(puzzle)
            except Exception as e:
                # Log error but continue
                print(f"Error analyzing moves for game {game.id}: {e}")
                continue

    # NEW: Line clustering and weak line analysis
    start_time = time.perf_counter()
    line_clusters = cluster_games_by_line(normalized_games)
    weak_lines = analyze_weak_lines(line_clusters, move_analyses_by_game, user_identifier)
    perf_metrics["clustering_time"] = time.perf_counter() - start_time
    
    # Debug: Log puzzle generation stats
    print(f"[PuzzleGen] Total games analyzed: {len(move_analyses_by_game)}")
    print(f"[PuzzleGen] Total puzzles generated: {len(puzzles)}")
    if puzzles:
        print(f"[PuzzleGen] Sample puzzle: {puzzles[0]}")
    
    # NEW: Link puzzles to weak lines
    # Create mapping from line_hash to weak_line_id
    line_hash_to_weak_line_id = {}
    for weak_line in weak_lines:
        # Extract line_hash from weak_line id (format: wl_{line_hash})
        line_hash = weak_line["id"].replace("wl_", "")
        line_hash_to_weak_line_id[line_hash] = weak_line["id"]
    
    # Link puzzles to weak lines based on which games they came from
    for puzzle in puzzles:
        game_id = puzzle["game_id"]
        # Find which line cluster this game belongs to
        for line_hash, games_in_line in line_clusters.items():
            if any(str(game_data["game"].id) == game_id for game_data in games_in_line):
                weak_line_id = line_hash_to_weak_line_id.get(line_hash)
                if weak_line_id:
                    puzzle["weak_line_id"] = weak_line_id
                    # Add puzzle to weak line's puzzle_ids
                    for weak_line in weak_lines:
                        if weak_line["id"] == weak_line_id:
                            if puzzle["puzzle_id"] not in weak_line["puzzle_ids"]:
                                weak_line["puzzle_ids"].append(puzzle["puzzle_id"])
                            break
                break

    # NEW: Generate tactical insights
    tactical_insights = generate_tactical_insights(
        move_analyses_by_game, weak_lines, len(normalized_games)
    )

    # NEW: Build charts data
    eval_swing_aggregated = compute_eval_swing_by_ply(move_analyses_by_game)
    swing_insights = generate_eval_swing_insights(eval_swing_aggregated)
    
    # Build game ECO map for motif computation
    game_eco_simple = {str(g.id): g.opening_eco or "" for g in normalized_games}
    
    # NEW: Compute tactical motif analysis (redesigned system)
    mistake_motifs = compute_mistake_motifs(move_analyses_by_game, game_eco_simple)
    defensive_motifs = compute_defensive_motifs(move_analyses_by_game, game_eco_simple)
    
    # Legacy tactical pattern chart (kept for backward compatibility)
    # Only counts patterns when user made a mistake
    tactical_pattern_chart = {}
    
    for game_id, move_analyses in move_analyses_by_game.items():
        for move_analysis in move_analyses:
            # Only count patterns when user made a BLUNDER (significant error)
            # Note: heuristics detect positional features, not tactical causes
            mistake_type = move_analysis.get("mistake_type")
            if mistake_type != "blunder":
                continue
            
            # Tactical pattern chart
            heuristics = move_analysis.get("heuristics", {})
            for pattern in ["fork", "pin", "skewer", "xray", "hanging_piece",
                           "trapped_piece", "overloaded_piece", "discovered_attack"]:
                if heuristics.get(pattern, False):
                    tactical_pattern_chart[pattern] = tactical_pattern_chart.get(pattern, 0) + 1

    tactical_pattern_chart_list = [
        {"pattern": pattern, "count": count}
        for pattern, count in sorted(tactical_pattern_chart.items(), key=lambda x: x[1], reverse=True)
    ]

    # Aggregate opening statistics
    opening_stats = aggregate_by_eco_and_color(normalized_games, user_identifier)

    if not opening_stats:
        return None

    # Separate by color
    white_stats, black_stats = separate_by_color(opening_stats)

    # Classify repertoires
    white_repertoire = classify_repertoire(white_stats, "white")
    black_repertoire = classify_repertoire(black_stats, "black")

    # Filter empty categories
    white_repertoire = filter_empty_categories(white_repertoire)
    black_repertoire = filter_empty_categories(black_repertoire)

    # Auto-tag openings by statistical category -> repertoire bucket
    def apply_auto_tags(rep_by_color: Dict[str, Any]) -> None:
        for category, group in rep_by_color.items():
            tag = map_category_to_repertoire_tag(category)
            if not tag:
                continue
            for opening in getattr(group, "openings", []):
                opening.repertoire_tags = [tag]

    apply_auto_tags(white_repertoire)
    apply_auto_tags(black_repertoire)

    # Generate insights (existing + new tactical insights)
    existing_insights = generate_insights(white_repertoire, black_repertoire, len(normalized_games))
    # Merge tactical insights with existing insights
    insights = existing_insights + tactical_insights + swing_insights

    # Generate suggested repertoires
    suggested_repertoires = generate_suggested_repertoires(white_repertoire, black_repertoire)

    # Calculate overall statistics
    total_games = len(normalized_games)
    white_games = len([g for g in normalized_games
                      if g.white and g.white.username and g.white.username.lower() == user_identifier.lower()])
    black_games = len([g for g in normalized_games
                      if g.black and g.black.username and g.black.username.lower() == user_identifier.lower()])

    # Calculate overall winrate
    total_wins = sum(stats.wins for stats in opening_stats)
    total_losses = sum(stats.losses for stats in opening_stats)
    total_draws = sum(stats.draws for stats in opening_stats)
    total_analyzed_games = total_wins + total_losses + total_draws

    overall_winrate = (total_wins + 0.5 * total_draws) / total_analyzed_games if total_analyzed_games > 0 else 0.0

    analysis_summary = analyze_games_for_summary(normalized_games, user_identifier)

    # Build a mapping from game_id to ECO info for enriching move analysis
    game_eco_map = {}
    for game in normalized_games:
        game_eco_map[str(game.id)] = {
            "eco": game.opening_eco,
            "opening_name": game.opening_name
        }

    # Build engine analysis moves list with ECO enrichment
    all_moves = []
    for game_id, move_analyses in move_analyses_by_game.items():
        eco_info = game_eco_map.get(game_id, {})
        for move in move_analyses:
            # Add ECO info and game_id to each move for per-opening filtering on frontend
            enriched_move = {
                **move,
                "game_id": game_id,
                "eco": eco_info.get("eco"),
                "opening_name": eco_info.get("opening_name")
            }
            all_moves.append(enriched_move)

    # NEW: Extract highlights from move analysis
    report_data_for_highlights = {
        "generated_puzzles": puzzles,
        "weak_lines": weak_lines
    }
    highlights = extract_highlights(all_moves, report_data_for_highlights)
    print(f"[HighlightExtraction] Generated {len(highlights)} highlights")

    # Create and return report
    report = RepertoireReport(
        user_id=request.user_id or request.session_id or "unknown",
        total_games=total_games,
        white_games=white_games,
        black_games=black_games,
        analysis_date=datetime.utcnow(),
        user_repertoires=user_repertoires or None,
        white_repertoire=white_repertoire,
        black_repertoire=black_repertoire,
        insights=insights,
        suggested_repertoires=suggested_repertoires,
        overall_winrate=overall_winrate,
        result_breakdown=analysis_summary.get("result_breakdown", {}),
        time_usage=analysis_summary.get("time_usage", []),
        game_length_histogram=analysis_summary.get("game_length_histogram", []),
        time_control_breakdown=analysis_summary.get("time_control_breakdown", []),
        # NEW FIELDS
        engine_analysis={"moves": all_moves} if all_moves else None,
        weak_lines=weak_lines if weak_lines else None,
        generated_puzzles=puzzles if puzzles else None,
        charts_additional={
            "eval_swing_aggregated": eval_swing_aggregated,
            "tactical_pattern_chart": tactical_pattern_chart_list,
            "mistake_motifs": [m.model_dump() for m in mistake_motifs] if mistake_motifs else [],
            "defensive_motifs": [m.model_dump() for m in defensive_motifs] if defensive_motifs else []
        } if eval_swing_aggregated or tactical_pattern_chart_list or mistake_motifs or defensive_motifs else None,
        highlights=highlights if highlights else None
    )

    # NEW: Compute playstyle profile (fail-safe - don't break reports if this fails)
    try:
        report.playstyle_profile = compute_playstyle_profile(report)
        print(f"[PlaystyleProfile] Successfully computed playstyle profile")
        
        # Annotate openings with style alignment data
        annotate_openings_with_style(report)
        print(f"[PlaystyleProfile] Annotated openings with style data")
        
        # Build repertoire fit list (user systems only)
        report.repertoire_fit = build_repertoire_fit(report)
        print(f"[PlaystyleProfile] Built repertoire fit list: {len(report.repertoire_fit)} items")
        
        # NEW: Compute population-normalized metrics (aggression, volatility, entropy)
        try:
            from .playstyle_service import compute_population_normalized_metrics
            population_metrics = await compute_population_normalized_metrics(
                report=report,
                pool=pool,
                rating=None,  # Will estimate from report
                speed=None,   # Will detect from report
                era="all",    # Current era
                color="white",  # Aggregate
            )
            if population_metrics:
                # Store as dict for JSON serialization in report
                if hasattr(report.playstyle_profile, '__dict__'):
                    report.playstyle_profile.population_metrics = population_metrics.model_dump()
                print(f"[PopulationMetrics] Added to playstyle_profile: agg={population_metrics.aggression is not None}, vol={population_metrics.volatility is not None}")
        except Exception as e:
            print(f"[PopulationMetrics] Computation failed: {e}")
            # Don't break report - population metrics are optional
    except Exception as e:
        print(f"[PlaystyleProfile] Computation failed: {e}")
        # Don't break report generation - playstyle is optional

    # ==========================================================================
    # LC0 PREMIUM AUGMENTATION (additive only, never modifies baseline)
    # ==========================================================================
    try:
        from ..config.ml_config import get_ml_config
        from ..config.lc0_premium_config import get_lc0_premium_context
        
        ml_config = get_ml_config()
        
        # Get user subscription status for premium gating
        subscription_status = None
        if request.user_id:
            try:
                user_row = await pool.fetchrow(
                    "SELECT subscription_status, trial_expires_at FROM users WHERE id = $1",
                    request.user_id if isinstance(request.user_id, str) else str(request.user_id)
                )
                if user_row:
                    subscription_status = user_row.get("subscription_status")
                    trial_expires_at = user_row.get("trial_expires_at")
                    if trial_expires_at:
                        now = datetime.now(timezone.utc)
                        if trial_expires_at > now and subscription_status not in ("active", "premium"):
                            subscription_status = "trialing"
                        elif trial_expires_at <= now and subscription_status == "trialing":
                            subscription_status = "free"
            except Exception as e:
                print(f"[LC0Premium] Failed to fetch subscription status: {e}")
        
        # Get LC0 premium context (gated by flags AND premium status)
        lc0_context = get_lc0_premium_context(subscription_status, ml_config)
        
        if lc0_context.any_enabled:
            print(f"[LC0Premium] Generating overlays for premium user")
            from .reports.premium_lc0 import build_lc0_overlays
            
            premium_lc0 = build_lc0_overlays(
                report=report,
                context=lc0_context,
                timeout_seconds=ml_config.lc0_timeout_seconds
            )
            
            if premium_lc0:
                # Convert report to dict and add premium section
                report_dict = report.model_dump() if hasattr(report, 'model_dump') else report
                report_dict["premium_lc0"] = premium_lc0
                print(f"[LC0Premium] Added premium_lc0 section with {len(premium_lc0)} keys")
                return report_dict
        else:
            print(f"[LC0Premium] Skipped: user_premium={subscription_status == 'premium'}, any_flag_enabled={ml_config.lc0_premium_all or ml_config.lc0_premium_reports or ml_config.lc0_premium_puzzles or ml_config.lc0_premium_repertoire or ml_config.lc0_premium_insights}")
    except Exception as e:
        print(f"[LC0Premium] Failed to generate overlays: {e}")
        # Don't break report generation - LC0 is optional

    return report


def validate_analysis_request(request: RepertoireAnalysisRequest) -> tuple[bool, Optional[str]]:
    """
    Validate that the analysis request has the required parameters.

    Args:
        request: The analysis request to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not request.user_id and not request.session_id:
        return False, "Either user_id or session_id must be provided"

    if request.min_games < 1:
        return False, "min_games must be at least 1"

    if request.min_games > 100:
        return False, "min_games cannot exceed 100"

    return True, None


async def get_cached_report(pool: asyncpg.Pool, user_id: str, max_age_hours: int = 24) -> Optional[dict]:
    """
    Check if there's a recent cached repertoire report for the user.

    Args:
        pool: Database connection pool
        user_id: User identifier
        max_age_hours: Maximum age of cached report in hours

    Returns:
        Cached report data or None if not found/expired
    """
    # This could be implemented to cache reports in the database
    # For now, we'll generate fresh reports each time
    return None


async def cache_report(pool: asyncpg.Pool, user_id: str, report: RepertoireReport) -> None:
    """
    Cache a repertoire report for future use.

    Args:
        pool: Database connection pool
        user_id: User identifier
        report: Report to cache
    """
    # This could be implemented to store reports in the database
    # For now, we'll skip caching
    pass


async def generate_repertoire_report_with_smart_import(
    pool: asyncpg.Pool,
    request: RepertoireAnalysisRequest,
    import_url: str = "http://import:8000",
    progress_callback: Optional[Callable] = None
) -> tuple[Optional[RepertoireReport], Optional[SmartImportResult]]:
    """
    Generate a repertoire report with smart import - check existing games first,
    then import only missing games if needed.

    Args:
        pool: Database connection pool
        request: Analysis request with import parameters
        import_url: URL of the import service
        progress_callback: Optional callback for progress updates

    Returns:
        Tuple of (RepertoireReport, SmartImportResult) or (None, import_result) if failed
    """
    import_result = None

    try:
        # Step 1: Perform smart import if requested
        if request.import_request:
            import_result = await perform_smart_import(
                pool=pool,
                user_id=request.user_id,
                session_id=request.session_id,
                import_request=request.import_request,
                date_range=request.date_range,
                force_import=request.force_import,
                import_url=import_url,
                progress_callback=progress_callback
            )

            if not import_result.success:
                return None, import_result

            # Update progress after import
            if progress_callback:
                progress = ImportProgress()
                progress.status = "analyzing"
                progress.message = "Analyzing..."
                progress.existing_games = import_result.existing_games_count
                progress.newly_imported = import_result.newly_imported_count
                progress.total_processed = import_result.total_games_available
                await progress_callback(progress)

        # Step 2: Generate the report using existing analysis logic
        report = await generate_repertoire_report(pool, request)

        if report and import_result:
            # Add import metadata to the report if available
            if hasattr(report, 'import_summary'):
                report.import_summary = import_result.import_summary

        # Final progress update
        if progress_callback:
            progress = ImportProgress()
            progress.status = "completed"
            progress.message = "Report generation completed"
            if import_result:
                progress.existing_games = import_result.existing_games_count
                progress.newly_imported = import_result.newly_imported_count
                progress.total_processed = import_result.total_games_available
            await progress_callback(progress)

        return report, import_result

    except Exception as e:
        # Update progress with error
        if progress_callback:
            progress = ImportProgress()
            progress.status = "error"
            progress.error = str(e)
            progress.message = f"Report generation failed: {str(e)}"
            await progress_callback(progress)

        if import_result:
            import_result.success = False
            import_result.error_message = str(e)

        return None, import_result
