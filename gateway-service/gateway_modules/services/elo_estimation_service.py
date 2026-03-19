"""
Elo estimation service based on average centipawn loss.

Based on Chesskit implementation:
https://github.com/GuillaumeSD/Chesskit/blob/main/src/lib/engine/helpers/estimateElo.ts
"""

import math
from typing import List, Dict, Any, Optional, Tuple


def clamp_cp(cp: Optional[int], mate: Optional[int]) -> int:
    """
    Clamp centipawn value to a reasonable range and handle mate scores.
    
    Args:
        cp: Centipawn evaluation
        mate: Mate in N moves (positive = white mates)
        
    Returns:
        Clamped centipawn value (-1000 to +1000)
    """
    if mate is not None:
        # Mate scores treated as +/- 1000 for CPL calculation
        return 1000 if mate > 0 else -1000
    if cp is None:
        return 0
    return max(-1000, min(1000, cp))


def get_players_average_cpl(
    move_analyses: List[Dict[str, Any]]
) -> Tuple[Optional[float], Optional[float]]:
    """
    Calculate Average Centipawn Loss (ACPL) for each player.
    
    ACPL measures how many centipawns a player loses per move compared 
    to the engine's best move. Lower ACPL = stronger play.
    
    Target values:
    - Super GM (~2700+): ACPL ~15-25
    - GM (~2500): ACPL ~25-35
    - IM (~2400): ACPL ~35-50
    - Expert (~2000): ACPL ~50-75
    - Club player (~1500): ACPL ~75-100
    - Beginner (~1000): ACPL ~100-150
    
    Args:
        move_analyses: List of move analysis dictionaries
                      Each should have: ply, eval (played), best_eval (engine best)

    Returns:
        Tuple of (white_avg_cpl, black_avg_cpl), None if no moves
    """
    import logging
    logger = logging.getLogger(__name__)
    
    white_cpl_values = []
    black_cpl_values = []

    for i, move in enumerate(move_analyses):
        # Determine which player made this move
        # Ply 1 (odd) = White's move, Ply 2 (even) = Black's move
        ply = move.get('ply', i + 1)  # Default to 1-indexed
        is_white_move = (ply % 2 == 1)

        # Get evaluations
        eval_data = move.get('eval', {})
        best_eval = move.get('best_eval')
        
        if best_eval is None:
            # Skip if we don't have best_eval data
            continue
        
        # Clamp values to handle mates and extreme evaluations
        cp_played = clamp_cp(eval_data.get('cp'), eval_data.get('mate'))
        cp_best = clamp_cp(best_eval.get('cp'), best_eval.get('mate'))

        # Calculate CPL from the perspective of the moving player
        # All evals are from White's POV (positive = good for White)
        if is_white_move:
            # White wants POSITIVE eval (higher = better)
            # Best move should give highest (or equal) eval
            # Loss = what we could have had - what we got
            # Ex: Best move gives +100cp, played move gives +20cp -> loss = 80cp
            cpl = max(0, cp_best - cp_played)
            white_cpl_values.append(cpl)
        else:
            # Black wants NEGATIVE eval (lower = better for Black)
            # Best move should give lowest (or equal) eval for White
            # Loss = what we got (bad for black) - what we could have had
            # Ex: Best move gives -100cp, played move gives +50cp -> loss = 150cp
            cpl = max(0, cp_played - cp_best)
            black_cpl_values.append(cpl)

    # Calculate averages
    white_avg = sum(white_cpl_values) / len(white_cpl_values) if white_cpl_values else None
    black_avg = sum(black_cpl_values) / len(black_cpl_values) if black_cpl_values else None

    # Log for debugging
    if white_avg is not None:
        logger.info(f"[ACPL] White: {white_avg:.1f} (from {len(white_cpl_values)} moves)")
    if black_avg is not None:
        logger.info(f"[ACPL] Black: {black_avg:.1f} (from {len(black_cpl_values)} moves)")

    return (white_avg, black_avg)


def get_elo_from_average_cpl(avg_cpl: float) -> float:
    """
    Estimate Elo rating from average centipawn loss.

    Formula from Lichess: Elo = 3100 * e^(-0.01 * avgCpl)

    Args:
        avg_cpl: Average centipawn loss

    Returns:
        Estimated Elo rating
    """
    # Clamp CPL to reasonable range
    avg_cpl = max(0, min(avg_cpl, 500))

    # Lichess formula
    estimated_elo = 3100 * math.exp(-0.01 * avg_cpl)

    return max(100, min(3100, estimated_elo))


def get_average_cpl_from_elo(elo: float) -> float:
    """
    Calculate expected average CPL from Elo rating.

    Inverse of the Elo estimation formula.

    Args:
        elo: Elo rating

    Returns:
        Expected average CPL
    """
    elo = max(100, min(elo, 3100))
    return -100 * math.log(elo / 3100)


def get_elo_from_rating_and_cpl(
    known_rating: int,
    avg_cpl: float
) -> float:
    """
    Adjust Elo estimate using known rating.

    Blends the pure CPL-based estimate with the known rating
    using an exponential adjustment factor.

    Args:
        known_rating: Actual rating from game
        avg_cpl: Average centipawn loss

    Returns:
        Adjusted Elo estimate
    """
    estimated_elo = get_elo_from_average_cpl(avg_cpl)

    # Calculate adjustment factor
    # Smaller adjustments for closer estimates
    diff = known_rating - estimated_elo
    adjustment = 0.005 * diff

    # Apply exponential scaling for smoother blending
    adjusted_elo = estimated_elo + adjustment * (1 + abs(diff) / 1000)

    return max(100, min(3500, adjusted_elo))


def estimate_game_elo(
    move_analyses: List[Dict[str, Any]],
    white_elo: Optional[int] = None,
    black_elo: Optional[int] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Estimate Elo ratings for both players based on game performance.

    Args:
        move_analyses: List of move analysis dictionaries
        white_elo: Known white player rating (optional)
        black_elo: Known black player rating (optional)

    Returns:
        Dictionary with estimates for both players:
        {
            'white': {
                'estimated': float,  # Pure CPL-based estimate
                'adjusted': float,   # Adjusted using known rating (if available)
                'known_rating': int  # Original rating (if provided)
            },
            'black': { ... }
        }
    """
    import logging
    logger = logging.getLogger(__name__)
    
    white_avg_cpl, black_avg_cpl = get_players_average_cpl(move_analyses)
    
    # SANITY GUARD: Log CPL values for debugging
    total_moves = len(move_analyses) if move_analyses else 0
    logger.info(f"[Elo Estimation] Total moves: {total_moves}, White CPL: {white_avg_cpl}, Black CPL: {black_avg_cpl}")
    
    # SANITY GUARD: Warn if CPL is suspiciously low (indicates broken analysis)
    if total_moves >= 10:  # Only check for games with enough moves
        if white_avg_cpl is not None and white_avg_cpl < 1:
            logger.warning(f"[Elo Estimation] SUSPICIOUS: White avg CPL = {white_avg_cpl} (too low!). Check if best_eval is being computed correctly.")
        if black_avg_cpl is not None and black_avg_cpl < 1:
            logger.warning(f"[Elo Estimation] SUSPICIOUS: Black avg CPL = {black_avg_cpl} (too low!). Check if best_eval is being computed correctly.")

    result = {
        'white': {
            'estimated': 0,
            'adjusted': None,
            'known_rating': white_elo
        },
        'black': {
            'estimated': 0,
            'adjusted': None,
            'known_rating': black_elo
        }
    }

    # Calculate white's estimates
    if white_avg_cpl is not None:
        result['white']['estimated'] = round(get_elo_from_average_cpl(white_avg_cpl))

        if white_elo is not None:
            result['white']['adjusted'] = round(
                get_elo_from_rating_and_cpl(white_elo, white_avg_cpl)
            )
            
            # SANITY GUARD: Warn if estimated Elo is much higher than known rating
            if result['white']['estimated'] > 2600 and white_elo < 2200:
                logger.warning(f"[Elo Estimation] SUSPICIOUS: White estimated {result['white']['estimated']} but actual rating is {white_elo}")

    # Calculate black's estimates
    if black_avg_cpl is not None:
        result['black']['estimated'] = round(get_elo_from_average_cpl(black_avg_cpl))

        if black_elo is not None:
            result['black']['adjusted'] = round(
                get_elo_from_rating_and_cpl(black_elo, black_avg_cpl)
            )
            
            # SANITY GUARD: Warn if estimated Elo is much higher than known rating
            if result['black']['estimated'] > 2600 and black_elo < 2200:
                logger.warning(f"[Elo Estimation] SUSPICIOUS: Black estimated {result['black']['estimated']} but actual rating is {black_elo}")

    return result
