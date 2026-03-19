"""
Puzzle generation service for creating puzzles from blunders.

Step 1 augmentation: Adds quality_score and explain when ml_config.puzzle_quality_scoring is enabled.
This does NOT change trigger conditions - puzzles are still generated from blunders/mistakes only.
"""

from typing import Dict, Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig


# Tactical patterns for theme extraction
TACTICAL_PATTERNS = [
    "fork", "pin", "skewer", "xray", "hanging_piece",
    "trapped_piece", "overloaded_piece", "discovered_attack"
]


def extract_themes_from_heuristics(heuristics: Dict[str, Any]) -> List[str]:
    """
    Extract puzzle themes from heuristics dictionary.
    
    Args:
        heuristics: Dict with boolean flags for tactical patterns
        
    Returns:
        List of theme strings, or ["tactical"] if no specific themes found
    """
    themes = []
    for pattern in TACTICAL_PATTERNS:
        if heuristics.get(pattern, False):
            themes.append(pattern)
    
    # Default theme if no specific patterns found
    if not themes:
        themes = ["tactical"]
    
    return themes


def detect_phase_from_ply(ply: int) -> str:
    """
    Detect game phase from ply number.
    
    Args:
        ply: Move ply number
        
    Returns:
        "opening", "middlegame", or "endgame"
    """
    if ply <= 20:  # First 10 moves
        return "opening"
    elif ply <= 60:  # Moves 11-30
        return "middlegame"
    else:
        return "endgame"


def generate_puzzle_from_blunder(
    game_id: str,
    move_ply: int,
    fen_before: str,
    eval_data: Dict[str, Any],
    heuristics: Dict[str, Any],
    mistake_move: str,
    weak_line_id: Optional[str] = None,
    eco: Optional[str] = None,
    mistake_type: Optional[str] = None,
    ml_config: Optional["MLConfig"] = None,
    quality_tracker: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Generate a puzzle object from a blunder move.

    Args:
        game_id: Game identifier
        move_ply: Ply number where blunder occurred
        fen_before: FEN string before the blunder move
        eval_data: Evaluation data from Stockfish (contains best_move, optional multipv data)
        heuristics: Heuristics dictionary from position analysis
        mistake_move: SAN notation of the actual blunder move
        weak_line_id: Optional weak line ID to link this puzzle
        eco: Optional ECO code of the opening this blunder occurred in
        mistake_type: Optional mistake classification ("blunder", "mistake")
        ml_config: Optional ML configuration for augmented features
        quality_tracker: Optional PuzzleQualityTracker for bulk scoring

    Returns:
        Puzzle dictionary with optional quality_score and explain when ML features enabled
    """
    # Extract side to move from FEN
    fen_parts = fen_before.split()
    side_to_move = "white" if fen_parts[1] == "w" else "black"

    # Extract themes from heuristics
    themes = extract_themes_from_heuristics(heuristics)

    # Generate puzzle ID
    puzzle_id = f"pz_{game_id}_{move_ply}"

    # Get best move from eval_data
    best_move = eval_data.get("best_move", "")

    # Build base puzzle object (BASELINE - unchanged)
    puzzle: Dict[str, Any] = {
        "puzzle_id": puzzle_id,
        "game_id": game_id,
        "move_ply": move_ply,
        "fen": fen_before,
        "side_to_move": side_to_move,
        "best_move": best_move,
        "theme": themes,
        "mistake_move": mistake_move,
        "weak_line_id": weak_line_id,
        "eco": eco,
        "mistake_type": mistake_type,
        "move_number": (move_ply + 1) // 2,
    }

    # ==========================================================================
    # AUGMENTED BEHAVIOR: Quality scoring (Step 1)
    # Only activated when ml_config.puzzle_quality_scoring is True
    # ==========================================================================
    if ml_config is not None and ml_config.puzzle_quality_scoring:
        # Import here to avoid circular imports
        from .puzzle_quality_scorer import compute_puzzle_quality, PuzzleQualityTracker
        
        # Detect phase from ply
        phase = detect_phase_from_ply(move_ply)
        
        # Get eval delta from eval_data
        eval_delta = eval_data.get("eval_delta", 0)
        if eval_delta == 0:
            # Fallback: estimate from cp values if available
            cp_before = eval_data.get("cp_before", 0)
            cp_after = eval_data.get("cp", 0)
            eval_delta = cp_after - cp_before
        
        # Get MultiPV gap if available (from Step 2)
        multipv_gap_cp = eval_data.get("multipv_gap_cp", None)
        
        if quality_tracker is not None:
            # Use tracker for bulk processing with redundancy detection
            puzzle = quality_tracker.score_puzzle(
                puzzle=puzzle,
                eval_delta=eval_delta,
                heuristics=heuristics,
                phase=phase,
                multipv_gap_cp=multipv_gap_cp,
            )
        else:
            # Standalone scoring without redundancy tracking
            from collections import defaultdict
            empty_counts: Dict[tuple, int] = defaultdict(int)
            
            score, components, explain = compute_puzzle_quality(
                puzzle=puzzle,
                eval_delta=eval_delta,
                heuristics=heuristics,
                phase=phase,
                motif_eco_counts=empty_counts,
                multipv_gap_cp=multipv_gap_cp,
                ml_config=ml_config,
            )
            
            puzzle["quality_score"] = score
            puzzle["quality_components"] = components
            puzzle["explain"] = explain.model_dump()

    # ==========================================================================
    # AUGMENTED BEHAVIOR: Forcedness filter (Step 2)
    # Only activated when ml_config.multipv_forcedness_filter is True
    # Requires MultiPV data in eval_data (multipv_gap_cp, is_forced)
    # ==========================================================================
    if ml_config is not None and ml_config.multipv_forcedness_filter:
        from .multipv_forcedness_service import apply_forcedness_filter
        
        # Apply forcedness filter (modifies puzzle in place)
        should_keep, puzzle = apply_forcedness_filter(
            puzzle=puzzle,
            eval_data=eval_data,
            ml_config=ml_config,
        )
        
        # Mark puzzle for filtering if hard mode and not forced
        if not should_keep:
            puzzle["_filtered_by_forcedness"] = True

    return puzzle

