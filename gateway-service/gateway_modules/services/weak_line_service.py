"""
Weak line analysis service for identifying problematic opening lines.
"""

from typing import Dict, List, Any
from collections import defaultdict
from .opening_analyzer import NormalizedGame, determine_user_color_and_result


def analyze_weak_lines(
    line_clusters: Dict[str, List[Dict[str, Any]]],
    move_analyses_by_game: Dict[str, List[Dict[str, Any]]],
    user_identifier: str
) -> List[Dict[str, Any]]:
    """
    Analyze weak lines from clustered games and move analyses.

    Args:
        line_clusters: Dictionary from cluster_games_by_line()
        move_analyses_by_game: Dictionary mapping game_id to list of move analysis dicts
        user_identifier: Username to filter results

    Returns:
        List of weak line dictionaries matching section 1.3 structure
    """
    weak_lines = []

    for line_hash, games_in_line in line_clusters.items():
        if len(games_in_line) < 3:
            # Skip lines with fewer than 3 games
            continue

        # Calculate statistics for this line
        total_games = len(games_in_line)
        wins = 0
        losses = 0
        draws = 0
        eval_swings = []
        all_mistakes = []
        all_tactical_issues = set()

        for game_data in games_in_line:
            game = game_data["game"]
            
            # Determine user result
            user_color, user_result = determine_user_color_and_result(game, user_identifier)
            if user_result == "win":
                wins += 1
            elif user_result == "loss":
                losses += 1
            elif user_result == "draw":
                draws += 1

            # Get move analyses for this game
            game_id = str(game.id)
            move_analyses = move_analyses_by_game.get(game_id, [])
            
            # Collect eval swings from moves 5-10 (plies 10-20)
            for move_analysis in move_analyses:
                ply = move_analysis.get("ply", 0)
                if 10 <= ply <= 20:  # Moves 5-10
                    eval_delta = move_analysis.get("eval_delta", 0)
                    eval_swings.append(eval_delta)
                    
                    # Collect mistakes
                    mistake_type = move_analysis.get("mistake_type")
                    if mistake_type:
                        move_num = (ply // 2) + 1
                        all_mistakes.append(f"{mistake_type} on move {move_num}")
                    
                    # Collect tactical issues
                    heuristics = move_analysis.get("heuristics", {})
                    for pattern in ["fork", "pin", "skewer", "xray", "hanging_piece", 
                                   "trapped_piece", "overloaded_piece", "discovered_attack"]:
                        if heuristics.get(pattern, False):
                            all_tactical_issues.add(pattern)

        # Calculate winrate
        total_results = wins + losses + draws
        if total_results == 0:
            continue
        
        winrate = (wins + 0.5 * draws) / total_results

        # Calculate average eval swing
        avg_eval_swing = sum(eval_swings) / len(eval_swings) if eval_swings else 0.0
        # Convert to pawns (divide by 100)
        avg_eval_swing_pawns = avg_eval_swing / 100.0

        # Filter: only include weak lines
        if winrate >= 0.40 and avg_eval_swing_pawns >= -0.7:
            continue

        # Get most common mistakes (top 3-5)
        mistake_counts = defaultdict(int)
        for mistake in all_mistakes:
            mistake_counts[mistake] += 1
        common_mistakes = [
            mistake for mistake, count in sorted(mistake_counts.items(), key=lambda x: x[1], reverse=True)
        ][:5]

        # Get ECO from first game
        eco = games_in_line[0].get("eco")

        # Get line from first game
        line = games_in_line[0].get("line", [])

        # Generate weak line ID
        weak_line_id = f"wl_{line_hash}"

        weak_line = {
            "id": weak_line_id,
            "eco": eco,
            "line": line,
            "games_count": total_games,
            "winrate": winrate,
            "avg_eval_swing": avg_eval_swing_pawns,
            "common_mistakes": common_mistakes,
            "tactical_issues": list(all_tactical_issues)[:5],
            "puzzle_ids": []  # Will be populated later when linking puzzles
        }

        weak_lines.append(weak_line)

    # Sort by avg_eval_swing (most negative first), then by games_count
    weak_lines.sort(key=lambda x: (x["avg_eval_swing"], -x["games_count"]))

    return weak_lines






