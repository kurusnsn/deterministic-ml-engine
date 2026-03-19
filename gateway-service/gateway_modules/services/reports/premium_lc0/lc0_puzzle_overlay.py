"""
LC0 Puzzle Overlay Generator.

Generates premium augmentations for puzzles:
- Reranking by LC0 clarity metric
- Additional tags (high tension, quiet solution, etc.)
- Human-likeliness scoring
- Alternative top moves

Never modifies baseline puzzle list.
"""

import math
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


def generate_puzzle_overlay(
    puzzles: List[Dict[str, Any]],
    lc0_results: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Generate puzzle overlay from LC0 evaluations.
    
    Args:
        puzzles: List of baseline puzzle dicts
        lc0_results: Dict mapping FEN -> LC0 result
        
    Returns:
        Overlay dict with reranked IDs and annotations, or None if no data
        
    Example output:
        {
            "reranked_puzzle_ids": ["pz_game1_24", "pz_game2_18"],
            "puzzle_annotations": {
                "pz_game1_24": {
                    "lc0_value": 0.31,
                    "policy_entropy": 2.7,
                    "tags": ["high_tension", "quiet_solution"],
                    "alt_top_moves": [{"uci": "e4e5", "p": 0.18}],
                    "human_likeliness": 0.85
                }
            }
        }
    """
    if not puzzles or not lc0_results:
        return None
    
    annotations: Dict[str, Dict[str, Any]] = {}
    scored_puzzles: List[tuple] = []  # (puzzle_id, clarity_score)
    
    for puzzle in puzzles:
        puzzle_id = puzzle.get("puzzle_id")
        fen = puzzle.get("fen")
        best_move = puzzle.get("best_move", "")
        
        if not puzzle_id or not fen:
            continue
        
        lc0_data = lc0_results.get(fen)
        if not lc0_data:
            continue
        
        # Extract LC0 data
        value = lc0_data.get("value", 0.0)
        policy_entropy = lc0_data.get("policy_entropy", 0.0)
        policy_topk = lc0_data.get("policy_topk", [])
        
        # Compute tags based on LC0 analysis
        tags = _compute_puzzle_tags(policy_entropy, value, policy_topk, best_move)
        
        # Compute human-likeliness: how likely is the best move in LC0's policy?
        human_likeliness = _compute_human_likeliness(best_move, policy_topk)
        
        # Clarity score for ranking (lower entropy = clearer puzzle)
        # Adjust for value - positions closer to 0 are more tense
        clarity_score = _compute_clarity_score(policy_entropy, value)
        
        # Get alternative top moves (excluding the best move)
        alt_moves = [m for m in policy_topk if m.get("uci") != best_move][:3]
        
        annotations[puzzle_id] = {
            "lc0_value": round(value, 4),
            "policy_entropy": round(policy_entropy, 4),
            "tags": tags,
            "alt_top_moves": alt_moves,
            "human_likeliness": round(human_likeliness, 4) if human_likeliness else None,
        }
        
        scored_puzzles.append((puzzle_id, clarity_score))
    
    if not annotations:
        return None
    
    # Sort puzzles by clarity score (higher = clearer = better puzzle)
    scored_puzzles.sort(key=lambda x: x[1], reverse=True)
    reranked_ids = [pid for pid, _ in scored_puzzles]
    
    return {
        "reranked_puzzle_ids": reranked_ids,
        "puzzle_annotations": annotations,
    }


def _compute_puzzle_tags(
    entropy: float,
    value: float,
    policy_topk: List[Dict[str, Any]],
    best_move: str
) -> List[str]:
    """
    Compute descriptive tags for a puzzle based on LC0 analysis.
    
    Tags:
    - high_tension: Unclear position (entropy > 3.0 or value near 0)
    - quiet_solution: Best move is not a capture/check (would need more context)
    - decisive: Clear winning/losing (abs(value) > 0.7)
    - ambiguous: Multiple good moves (top 2 have similar probability)
    """
    tags = []
    
    # High tension: unclear position
    if entropy > 3.0 or abs(value) < 0.15:
        tags.append("high_tension")
    
    # Decisive: clear advantage
    if abs(value) > 0.7:
        tags.append("decisive")
    
    # Ambiguous: multiple good options
    if len(policy_topk) >= 2:
        p1 = policy_topk[0].get("p", 0)
        p2 = policy_topk[1].get("p", 0)
        if p2 > 0 and p1 / p2 < 1.5:  # Top 2 are close
            tags.append("ambiguous")
    
    # Check if solution is "quiet" (not capture/check)
    # Simple heuristic: if move doesn't contain 'x' and isn't a promotion
    if best_move and "x" not in best_move.lower() and "=" not in best_move:
        tags.append("quiet_solution")
    
    return tags


def _compute_human_likeliness(
    best_move: str,
    policy_topk: List[Dict[str, Any]]
) -> Optional[float]:
    """
    Compute how likely a human would find the best move.
    
    Based on LC0's policy probability for the best move.
    Higher = more intuitive, Lower = harder to find.
    """
    if not best_move or not policy_topk:
        return None
    
    # Find the best move in policy
    for move_data in policy_topk:
        uci = move_data.get("uci", "")
        if uci == best_move:
            return move_data.get("p", 0.0)
    
    # Move not in top-k, likely very unintuitive
    return 0.01


def _compute_clarity_score(entropy: float, value: float) -> float:
    """
    Compute clarity score for puzzle ranking.
    
    Higher score = clearer, more instructive puzzle
    - Low entropy contributes positively (clear best move)
    - Moderate value contributes positively (not completely won/lost)
    """
    # Invert entropy (lower entropy = higher clarity)
    # Normalize assuming entropy typically 0-5
    entropy_component = max(0, 5.0 - entropy) / 5.0
    
    # Value component: prefer positions that are slightly winning (0.2-0.6 range)
    abs_value = abs(value)
    if 0.2 <= abs_value <= 0.6:
        value_component = 1.0  # Ideal range
    elif abs_value < 0.2:
        value_component = 0.7  # Too equal
    else:
        value_component = 0.5  # Too decisive
    
    return entropy_component * 0.7 + value_component * 0.3
