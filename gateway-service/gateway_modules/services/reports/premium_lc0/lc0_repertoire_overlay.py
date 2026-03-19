"""
LC0 Repertoire Overlay Generator.

Generates premium augmentations for repertoire analysis:
- Alternative candidate moves at key nodes
- Policy disagreement flags (LC0 vs baseline preference)
- Diversity suggestions

Never modifies baseline repertoire structure.
"""

from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


def generate_repertoire_overlay(
    white_repertoire: Dict[str, Any],
    black_repertoire: Dict[str, Any],
    lc0_results: Dict[str, Dict[str, Any]],
    opening_fens: List[str],
) -> Optional[Dict[str, Any]]:
    """
    Generate repertoire overlay from LC0 evaluations.
    
    For each opening position, shows LC0's top move preferences
    and whether they agree with the player's typical choices.
    
    Args:
        white_repertoire: Baseline white repertoire data
        black_repertoire: Baseline black repertoire data  
        lc0_results: Dict mapping FEN -> LC0 result
        opening_fens: List of opening position FENs that were evaluated
        
    Returns:
        Overlay dict with node suggestions, or None if no data
        
    Example output:
        {
            "node_suggestions": {
                "<fen>": {
                    "lc0_top_moves": [{"uci":"e7e5", "p":0.35}, ...],
                    "baseline_move_in_topk": true,
                    "disagreement": false,
                    "diversity_suggestion": "Also consider: d5, c5"
                }
            }
        }
    """
    if not lc0_results or not opening_fens:
        return None
    
    node_suggestions: Dict[str, Dict[str, Any]] = {}
    
    for fen in opening_fens:
        lc0_data = lc0_results.get(fen)
        if not lc0_data:
            continue
        
        policy_topk = lc0_data.get("policy_topk", [])
        if not policy_topk:
            continue
        
        # Extract top moves
        lc0_top_moves = policy_topk[:5]  # Top 5 moves
        
        # For now, we don't have baseline move data per FEN
        # This would require cross-referencing with game move data
        baseline_move = _infer_baseline_move(fen, white_repertoire, black_repertoire)
        
        # Check if baseline move is in LC0's top choices
        baseline_in_topk = False
        if baseline_move:
            topk_ucis = [m.get("uci", "") for m in lc0_top_moves]
            baseline_in_topk = baseline_move in topk_ucis
        
        # Disagreement: LC0's top move is significantly different from baseline
        disagreement = False
        if baseline_move and lc0_top_moves:
            top_uci = lc0_top_moves[0].get("uci", "")
            top_prob = lc0_top_moves[0].get("p", 0)
            if top_uci != baseline_move and top_prob > 0.3:
                disagreement = True
        
        # Generate diversity suggestion
        diversity_suggestion = _generate_diversity_suggestion(lc0_top_moves, baseline_move)
        
        node_suggestions[fen] = {
            "lc0_top_moves": lc0_top_moves,
            "baseline_move_in_topk": baseline_in_topk,
            "disagreement": disagreement,
            "diversity_suggestion": diversity_suggestion,
        }
    
    if not node_suggestions:
        return None
    
    return {
        "node_suggestions": node_suggestions,
    }


def _infer_baseline_move(
    fen: str,
    white_repertoire: Dict[str, Any],
    black_repertoire: Dict[str, Any]
) -> Optional[str]:
    """
    Try to infer what move the user typically plays in this position.
    
    This is a simplified version - full implementation would track
    moves per FEN across all games.
    """
    # For now, return None - this would need move tracking per FEN
    # The UI can still show LC0 suggestions without baseline comparison
    return None


def _generate_diversity_suggestion(
    lc0_top_moves: List[Dict[str, Any]],
    baseline_move: Optional[str]
) -> Optional[str]:
    """
    Generate a diversity suggestion string.
    
    Shows 2-3 viable alternatives to the baseline move.
    """
    if not lc0_top_moves or len(lc0_top_moves) < 2:
        return None
    
    # Filter out baseline move and get alternatives
    alternatives = []
    for move_data in lc0_top_moves:
        uci = move_data.get("uci", "")
        prob = move_data.get("p", 0)
        
        # Only suggest moves with reasonable probability
        if prob >= 0.1 and uci != baseline_move:
            alternatives.append(_uci_to_display(uci))
    
    if not alternatives:
        return None
    
    # Format suggestion
    if len(alternatives) == 1:
        return f"Also consider: {alternatives[0]}"
    elif len(alternatives) == 2:
        return f"Also consider: {alternatives[0]}, {alternatives[1]}"
    else:
        return f"Also consider: {alternatives[0]}, {alternatives[1]}, {alternatives[2]}"


def _uci_to_display(uci: str) -> str:
    """
    Convert UCI move to more readable format.
    
    Simple conversion - full implementation would use python-chess.
    """
    if len(uci) == 4:
        # e2e4 -> e4 (simplified)
        return uci[2:4]
    elif len(uci) == 5:
        # e7e8q -> e8=Q
        return f"{uci[2:4]}={uci[4].upper()}"
    return uci
