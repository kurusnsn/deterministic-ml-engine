"""
Core opening analysis functions for chess repertoire analysis.
"""

import os
import re
import httpx
from collections import defaultdict
from typing import List, Dict, Tuple, Optional
from statistics import median, mean

# Import the existing NormalizedGame model - simplified for now
from typing import Optional

# ECO service URL for opening name lookups
ECO_URL = os.getenv("ECO_URL", "http://eco:8000")

# Cache for ECO code to opening name mappings
_eco_code_name_cache: Dict[str, str] = {}


def lookup_opening_name_by_eco(eco_code: str) -> str:
    """
    Look up the opening name for an ECO code from the ECO service.
    Results are cached to avoid repeated lookups.
    
    Args:
        eco_code: ECO code (e.g., 'D00', 'C50')
        
    Returns:
        Opening name if found, or 'Unknown Opening' if lookup fails
    """
    if not eco_code:
        return "Unknown Opening"
    
    # Check cache first
    if eco_code in _eco_code_name_cache:
        return _eco_code_name_cache[eco_code]
    
    try:
        # Call ECO service to get opening name
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"{ECO_URL}/eco/mainline",
                json={"eco": eco_code}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("found") and data.get("name"):
                    # Capitalize the name properly
                    name = data["name"].title()
                    _eco_code_name_cache[eco_code] = name
                    return name
    except Exception:
        # Silently fail and use fallback
        pass
    
    # Cache the fallback too to avoid repeated failed lookups
    _eco_code_name_cache[eco_code] = "Unknown Opening"
    return "Unknown Opening"


# Simplified NormalizedGame structure based on the import service
class PlayerInfo:
    def __init__(self, username=None, rating=None, result=None, color=None):
        self.username = username
        self.rating = rating
        self.result = result
        self.color = color

class NormalizedGame:
    def __init__(self, **kwargs):
        self.source = kwargs.get('source')
        self.id = kwargs.get('id')
        self.url = kwargs.get('url')
        self.site = kwargs.get('site')
        self.rated = kwargs.get('rated')
        self.perf = kwargs.get('perf')
        self.time_control = kwargs.get('time_control')
        self.start_time = kwargs.get('start_time')
        self.end_time = kwargs.get('end_time')
        self.white = kwargs.get('white')
        self.black = kwargs.get('black')
        self.result = kwargs.get('result')
        self.termination = kwargs.get('termination')
        self.opening_name = kwargs.get('opening_name')
        self.opening_eco = kwargs.get('opening_eco')
        self.pgn = kwargs.get('pgn')

from ..models.repertoire import OpeningStats
from ..config.repertoire_config import MIN_GAMES_FOR_ANALYSIS


def parse_time_control(time_control: str) -> Optional[int]:
    """
    Parse time control string to extract base time in seconds.

    Args:
        time_control: Time control string like "600+0", "180+2", "blitz", etc.

    Returns:
        Base time in seconds, or None if unparseable
    """
    if not time_control:
        return None

    # Handle formats like "600+5", "180+2"
    plus_match = re.match(r'(\d+)\+(\d+)', time_control.lower())
    if plus_match:
        return int(plus_match.group(1))

    # Handle simple number formats
    number_match = re.match(r'(\d+)', time_control)
    if number_match:
        return int(number_match.group(1))

    # Handle named formats
    time_control_lower = time_control.lower()
    if 'bullet' in time_control_lower:
        return 120  # 2 minutes
    elif 'blitz' in time_control_lower:
        return 300  # 5 minutes
    elif 'rapid' in time_control_lower:
        return 900  # 15 minutes
    elif 'classical' in time_control_lower or 'standard' in time_control_lower:
        return 1800  # 30 minutes

    return None


def calculate_game_duration(start_time: Optional[int], end_time: Optional[int]) -> Optional[int]:
    """
    Calculate game duration in seconds from start and end timestamps.

    Args:
        start_time: Start timestamp in milliseconds since epoch
        end_time: End timestamp in milliseconds since epoch

    Returns:
        Duration in seconds, or None if timestamps unavailable
    """
    if start_time and end_time and end_time > start_time:
        return (end_time - start_time) // 1000  # Convert ms to seconds
    return None


def determine_user_color_and_result(game: NormalizedGame, user_identifier: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Determine the user's color and result for a given game.

    Args:
        game: NormalizedGame object
        user_identifier: Username or identifier to match against

    Returns:
        Tuple of (color, result) where color is "white"/"black" and result is "win"/"loss"/"draw"
    """
    if not game.white or not game.black:
        return None, None

    user_color = None

    # Try to match username
    if game.white.username and game.white.username.lower() == user_identifier.lower():
        user_color = "white"
    elif game.black.username and game.black.username.lower() == user_identifier.lower():
        user_color = "black"

    if not user_color:
        return None, None

    # Determine result from user's perspective
    if not game.result:
        return user_color, None

    result_lower = game.result.lower()
    if result_lower in ["1-0", "win"]:
        user_result = "win" if user_color == "white" else "loss"
    elif result_lower in ["0-1", "loss"]:
        user_result = "loss" if user_color == "white" else "win"
    elif result_lower in ["1/2-1/2", "draw", "0.5-0.5"]:
        user_result = "draw"
    else:
        user_result = None

    return user_color, user_result


def is_user_system(opening_name: str, eco: str, user_color: str) -> bool:
    """
    Determine if an opening is the user's chosen system vs opponent's response.
    
    Args:
        opening_name: Name of the opening
        eco: ECO code
        user_color: Which color the user played as
        
    Returns:
        True if this is the user's chosen opening/defense, False if opponent's choice
    """
    name_lower = (opening_name or "").lower()
    
    if user_color == "white":
        # When playing white, opponent's defenses are NOT our system
        defence_keywords = [
            "sicilian defense", "french defense", "caro-kann", "pirc defense",
            "modern defense", "alekhine defense", "scandinavian", "philidor",
            "petrov", "petroff"
        ]
        return not any(k in name_lower for k in defence_keywords)
    else:
        # When playing black, white's aggressive systems are THEIR choice
        white_system_keywords = [
            "london system", "king's gambit", "vienna game", "scotch",
            "italian game", "ruy lopez", "spanish", "evans gambit",
            "queen's gambit", "catalan", "english opening"
        ]
        return not any(k in name_lower for k in white_system_keywords)


def aggregate_by_eco_and_color(games: List[NormalizedGame], user_identifier: str) -> List[OpeningStats]:
    """
    Aggregate games by ECO code and color, computing statistics for each combination.

    Args:
        games: List of NormalizedGame objects
        user_identifier: Username or identifier for the user

    Returns:
        List of OpeningStats for each ECO+color combination with sufficient games
    """
    # Group games by (ECO, color) combination
    grouped_games: Dict[Tuple[str, str, str], List[Dict]] = defaultdict(list)
    total_games = 0

    for game in games:
        if not game.opening_eco:
            continue

        user_color, user_result = determine_user_color_and_result(game, user_identifier)
        if not user_color or not user_result:
            continue

        total_games += 1

        # Create game data record
        game_data = {
            "result": user_result,
            "time_control": game.time_control,
            "start_time": game.start_time,
            "end_time": game.end_time
        }

        # Use ECO lookup if opening_name is missing
        opening_name = game.opening_name or lookup_opening_name_by_eco(game.opening_eco)
        key = (game.opening_eco, opening_name, user_color)
        grouped_games[key].append(game_data)

    # Calculate statistics for each group
    opening_stats = []

    for (eco_code, opening_name, color), game_data_list in grouped_games.items():
        games_count = len(game_data_list)

        # Skip openings with insufficient data
        if games_count < MIN_GAMES_FOR_ANALYSIS:
            continue

        # Count results
        wins = sum(1 for g in game_data_list if g["result"] == "win")
        losses = sum(1 for g in game_data_list if g["result"] == "loss")
        draws = sum(1 for g in game_data_list if g["result"] == "draw")

        # Calculate winrate and frequency
        winrate = (wins + 0.5 * draws) / games_count if games_count > 0 else 0.0
        frequency = games_count / total_games if total_games > 0 else 0.0

        # Calculate time statistics if available
        time_usages = []
        for game_data in game_data_list:
            # Try to get time from time control
            base_time = parse_time_control(game_data["time_control"])
            if base_time:
                time_usages.append(base_time)
            else:
                # Try to get time from game duration
                duration = calculate_game_duration(game_data["start_time"], game_data["end_time"])
                if duration:
                    time_usages.append(duration)

        avg_time = mean(time_usages) if time_usages else None
        median_time = median(time_usages) if time_usages else None

        # Create OpeningStats object
        stats = OpeningStats(
            eco_code=eco_code,
            opening_name=opening_name,
            color=color,
            games_count=games_count,
            wins=wins,
            losses=losses,
            draws=draws,
            winrate=winrate,
            frequency=frequency,
            avg_time_seconds=avg_time,
            median_time_seconds=median_time,
            user_is_system_side=is_user_system(opening_name, eco_code, color)
        )

        opening_stats.append(stats)

    return opening_stats


def get_user_identifier_from_games(games: List[NormalizedGame]) -> Optional[str]:
    """
    Try to determine the user identifier from the games list.
    This assumes the user appears consistently in most games.

    Args:
        games: List of NormalizedGame objects

    Returns:
        Most common username found, or None if unclear
    """
    if not games:
        return None

    username_counts = defaultdict(int)

    for game in games:
        if game.white and game.white.username:
            username_counts[game.white.username] += 1
        if game.black and game.black.username:
            username_counts[game.black.username] += 1

    if not username_counts:
        return None

    # Return the most common username
    most_common = max(username_counts.items(), key=lambda x: x[1])
    return most_common[0]


def separate_by_color(opening_stats: List[OpeningStats]) -> Tuple[List[OpeningStats], List[OpeningStats]]:
    """
    Separate opening statistics by color.

    Args:
        opening_stats: List of OpeningStats

    Returns:
        Tuple of (white_stats, black_stats)
    """
    white_stats = [stats for stats in opening_stats if stats.color == "white"]
    black_stats = [stats for stats in opening_stats if stats.color == "black"]

    return white_stats, black_stats