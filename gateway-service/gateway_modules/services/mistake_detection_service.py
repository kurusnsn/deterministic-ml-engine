"""
Mistake detection service for classifying move quality.
"""

from typing import Dict, Optional, Any


def classify_mistake(eval_before: int, eval_after: int) -> Dict[str, Any]:
    """
    Classify a move as inaccuracy, mistake, blunder, or missed win based on evaluation change.

    Args:
        eval_before: Centipawn evaluation before the move (from perspective of side to move)
        eval_after: Centipawn evaluation after the move (from perspective of side to move)

    Returns:
        Dictionary with keys: mistake_type, eval_delta
        mistake_type can be: None, "inaccuracy", "mistake", "blunder", "missed_win"
    """
    eval_delta = eval_after - eval_before
    abs_delta = abs(eval_delta)

    # Check for missed win first (special case)
    if eval_before > 300 and eval_after < 100:
        return {
            "mistake_type": "missed_win",
            "eval_delta": eval_delta
        }

    # Classify based on absolute delta thresholds
    if abs_delta > 200:
        return {
            "mistake_type": "blunder",
            "eval_delta": eval_delta
        }
    elif abs_delta > 100:
        return {
            "mistake_type": "mistake",
            "eval_delta": eval_delta
        }
    elif abs_delta > 30:
        return {
            "mistake_type": "inaccuracy",
            "eval_delta": eval_delta
        }
    else:
        return {
            "mistake_type": None,
            "eval_delta": eval_delta
        }

