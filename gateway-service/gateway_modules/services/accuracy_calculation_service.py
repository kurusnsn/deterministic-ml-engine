"""
Accuracy calculation service implementing Lichess's accuracy algorithm.

Based on Chesskit implementation:
https://github.com/GuillaumeSD/Chesskit/blob/main/src/lib/engine/helpers/accuracy.ts
"""

import math
from typing import List, Dict, Any, Optional
from statistics import stdev


def get_position_win_percentage(cp: Optional[int], mate: Optional[int]) -> float:
    """
    Convert centipawn evaluation to win percentage using Lichess sigmoid function.

    Args:
        cp: Centipawn evaluation (positive = white advantage)
        mate: Mate in N moves (positive = white mates, negative = black mates)

    Returns:
        Win percentage (0-100) from white's perspective
    """
    if mate is not None:
        # Forced mate positions
        if mate > 0:
            return 100.0  # White is winning
        elif mate < 0:
            return 0.0    # Black is winning
        else:
            return 50.0   # Draw (shouldn't happen)

    if cp is None:
        return 50.0

    # FIX: Clamp CP to range [-1000, 1000] to prevent math overflow
    # and keep the sigmoid shape consistent at extremes
    clamped_cp = max(-1000, min(1000, cp))

    # Lichess formula: 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)
    win_percentage = 50 + 50 * (2 / (1 + math.exp(-0.00368208 * clamped_cp)) - 1)

    return max(0.0, min(100.0, win_percentage))


def get_accuracy_weights(move_analyses: List[Dict[str, Any]]) -> List[float]:
    """
    Calculate weights for each move using sliding window standard deviation.

    Implements Chesskit's weighting system:
    - Uses sliding window of size 2-8 moves
    - Weight = 1 / (1 + stdev of win percentages in window)

    Args:
        move_analyses: List of move analysis dictionaries with 'eval' field

    Returns:
        List of weights (one per move)
    """
    if not move_analyses:
        return []

    # Calculate win percentages for all moves
    win_percentages = []
    for move in move_analyses:
        eval_data = move.get('eval', {})
        cp = eval_data.get('cp')
        mate = eval_data.get('mate')
        win_pct = get_position_win_percentage(cp, mate)
        win_percentages.append(win_pct)

    # FIX: Calculate a fixed window size based on game length (Lichess style)
    total_moves = len(win_percentages)
    base_window_size = int(math.ceil(total_moves / 10.0))
    window_size = max(2, min(8, base_window_size))
    half_window = window_size // 2
    
    weights = []

    for i in range(total_moves):
        # Sliding window centered on the move
        start = max(0, i - half_window)
        end = min(total_moves, i + half_window + 1)
        window = win_percentages[start:end]

        # Calculate weight based on standard deviation
        if len(window) >= 2:
            try:
                std = stdev(window)
                # FIX: Weight is PROPORTIONAL to std, not inverse
                # Chaotic positions (high std) are weighted more heavily
                # Clamp weight: min 0.5 (boring), max 12 (chaos)
                weight = max(0.5, min(12.0, std))
            except:
                weight = 0.5
        else:
            weight = 0.5  # Default low weight for single moves

        weights.append(weight)

    return weights


def get_moves_accuracy(move_analyses: List[Dict[str, Any]]) -> List[float]:
    """
    Calculate accuracy for each individual move using Lichess formula.

    Accuracy per move = 103.1668 * e^(-0.04354 * winDiff) - 3.1669
    
    winDiff = win% after best move - win% after played move
    (how much win% the player lost compared to optimal play)

    Args:
        move_analyses: List of move analysis dictionaries
                      Each should have: eval (played), best_eval (engine best)

    Returns:
        List of accuracy values (0-100) for each move
    """
    if not move_analyses:
        return []

    accuracies = []

    for i, move in enumerate(move_analyses):
        eval_data = move.get('eval', {})
        best_eval = move.get('best_eval', {})
        
        # If no best_eval data, fall back to prev_eval comparison (legacy behavior)
        if not best_eval or best_eval.get('cp') is None:
            prev_eval = move.get('prev_eval', {})
            cp_best = prev_eval.get('cp')
            mate_best = prev_eval.get('mate')
        else:
            cp_best = best_eval.get('cp')
            mate_best = best_eval.get('mate')
        
        cp_played = eval_data.get('cp')
        mate_played = eval_data.get('mate')

        # Determine which player made this move
        # Ply 1 = White's first move, Ply 2 = Black's first move, etc.
        # So: ply % 2 == 1 means White, ply % 2 == 0 means Black
        ply = move.get('ply', i + 1)  # Default to 1-indexed if missing
        is_white_move = (ply % 2 == 1)
        is_black_move = not is_white_move

        # Calculate win percentages from the perspective of the player moving
        # Stockfish eval is from White's perspective, so flip for Black
        if is_black_move:
            # For Black: higher cp is WORSE, so we flip
            win_pct_best = 100 - get_position_win_percentage(cp_best, mate_best)
            win_pct_played = 100 - get_position_win_percentage(cp_played, mate_played)
        else:
            # For White: higher cp is BETTER
            win_pct_best = get_position_win_percentage(cp_best, mate_best)
            win_pct_played = get_position_win_percentage(cp_played, mate_played)

        # Win difference = how much win% the player lost vs optimal
        # win_pct_best is what they could achieve, win_pct_played is what they got
        win_diff = max(0, win_pct_best - win_pct_played)

        # Chess.com-style "strict" accuracy formula
        # Steeper exponential decay that penalizes small mistakes more heavily
        # Comparison:
        #   win_diff=0  -> Lichess: 100%, Strict: 100%
        #   win_diff=5  -> Lichess: 82%,  Strict: 77%
        #   win_diff=10 -> Lichess: 66%,  Strict: 60%
        #   win_diff=20 -> Lichess: 43%,  Strict: 37%
        raw_accuracy = 100 * math.exp(-0.05 * win_diff)

        # Clamp to 0-100
        accuracy = max(0.0, min(100.0, raw_accuracy))

        accuracies.append(accuracy)

    return accuracies


def get_player_accuracy(
    move_analyses: List[Dict[str, Any]],
    color: str
) -> Optional[float]:
    """
    Calculate overall accuracy for a player (white or black).

    Uses combination of weighted mean and harmonic mean:
    final_accuracy = (weighted_mean + harmonic_mean) / 2

    Args:
        move_analyses: List of move analysis dictionaries
        color: 'white' or 'black'

    Returns:
        Overall accuracy (0-100) or None if no moves
    """
    if not move_analyses:
        return None

    # Get accuracies for all moves
    all_accuracies = get_moves_accuracy(move_analyses)

    # Get weights for all moves
    all_weights = get_accuracy_weights(move_analyses)

    # Filter to player's moves
    player_accuracies = []
    player_weights = []

    for i, move in enumerate(move_analyses):
        # Ply 1 = White's first move, Ply 2 = Black's first move
        # ply % 2 == 1 means White, ply % 2 == 0 means Black
        ply = move.get('ply', i + 1)  # Default to 1-indexed
        is_white_move = (ply % 2 == 1)

        if (color == 'white' and is_white_move) or (color == 'black' and not is_white_move):
            if i < len(all_accuracies) and i < len(all_weights):
                player_accuracies.append(all_accuracies[i])
                player_weights.append(all_weights[i])

    if not player_accuracies:
        return None

    # Calculate weighted mean
    total_weight = sum(player_weights)
    if total_weight > 0:
        weighted_mean = sum(
            acc * weight for acc, weight in zip(player_accuracies, player_weights)
        ) / total_weight
    else:
        weighted_mean = sum(player_accuracies) / len(player_accuracies)

    # Calculate harmonic mean
    # Harmonic mean = n / (1/x1 + 1/x2 + ... + 1/xn)
    # FIX: Cap minimum accuracy at 10.0 (not 0.01) to prevent one blunder
    # from crashing the entire game score
    harmonic_sum = sum(1.0 / max(acc, 10.0) for acc in player_accuracies)
    harmonic_mean = len(player_accuracies) / harmonic_sum if harmonic_sum > 0 else 0

    # Final accuracy: average of weighted mean and harmonic mean
    final_accuracy = (weighted_mean + harmonic_mean) / 2

    return max(0.0, min(100.0, final_accuracy))


def calculate_game_accuracy(
    move_analyses: List[Dict[str, Any]]
) -> Dict[str, float]:
    """
    Calculate accuracy for both players in a game.

    Args:
        move_analyses: List of move analysis dictionaries from pipeline

    Returns:
        Dictionary with 'white' and 'black' accuracy values (0-100)
    """
    white_accuracy = get_player_accuracy(move_analyses, 'white')
    black_accuracy = get_player_accuracy(move_analyses, 'black')

    return {
        'white': white_accuracy if white_accuracy is not None else 0.0,
        'black': black_accuracy if black_accuracy is not None else 0.0
    }
