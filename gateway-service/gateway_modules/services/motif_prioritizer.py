"""
Motif Cost Prioritization Service.

Turns bulk-import puzzles into a personalized training plan by prioritizing
motifs that cause the most damage to the player.

This is Step 3 of the ML pipeline augmentation.

Feature flag: ml_config.motif_cost_prioritization
"""

from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from collections import defaultdict

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig

from ..models.explain import MotifExplain


# Tactical patterns we prioritize
TACTICAL_PATTERNS = [
    "fork", "pin", "skewer", "xray", "hanging_piece",
    "trapped_piece", "overloaded_piece", "discovered_attack"
]


def compute_motif_costs(
    mistake_motifs: List[Dict[str, Any]],
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, float]:
    """
    Compute normalized cost per motif based on frequency and damage.
    
    Cost formula: count * abs(avg_cp_loss)
    
    Args:
        mistake_motifs: List of MistakeMotifEntry-like dicts with:
            - motif: str
            - count: int
            - avg_cp_loss: float (negative value)
        ml_config: Optional ML configuration
        
    Returns:
        Dict mapping motif name to normalized cost in [0, 1]
    """
    if not mistake_motifs:
        return {}
    
    # Compute raw costs
    raw_costs: Dict[str, float] = {}
    for entry in mistake_motifs:
        motif = entry.get("motif", "")
        count = entry.get("count", 0)
        avg_cp_loss = entry.get("avg_cp_loss", 0)
        
        # Cost = count * absolute loss
        cost = count * abs(avg_cp_loss)
        raw_costs[motif] = cost
    
    # Normalize to [0, 1]
    total_cost = sum(raw_costs.values())
    if total_cost == 0:
        return {m: 0.0 for m in raw_costs}
    
    normalized_costs = {
        motif: cost / total_cost
        for motif, cost in raw_costs.items()
    }
    
    return normalized_costs


def get_top_motifs(
    motif_costs: Dict[str, float],
    top_k: int = 3,
) -> List[str]:
    """
    Get top K motifs by cost.
    
    Args:
        motif_costs: Dict mapping motif to normalized cost
        top_k: Number of top motifs to return
        
    Returns:
        List of top motif names sorted by cost (highest first)
    """
    sorted_motifs = sorted(
        motif_costs.items(),
        key=lambda x: x[1],
        reverse=True
    )
    return [motif for motif, _ in sorted_motifs[:top_k]]


def compute_personal_relevance(
    puzzle_themes: List[str],
    motif_costs: Dict[str, float],
    top_motifs: List[str],
    ml_config: Optional["MLConfig"] = None,
) -> Tuple[float, MotifExplain]:
    """
    Compute personal relevance score for a puzzle.
    
    Relevance = sum of motif_cost_norm for each puzzle theme that matches
    the user's weakness patterns.
    
    Args:
        puzzle_themes: List of themes on this puzzle (e.g., ["fork", "tactical"])
        motif_costs: Dict mapping motif to normalized cost
        top_motifs: List of user's top problematic motifs
        ml_config: Optional ML configuration
        
    Returns:
        Tuple of (relevance_score, explain)
    """
    # Compute relevance as sum of costs for matching motifs
    relevance = 0.0
    matching_motifs = []
    
    for theme in puzzle_themes:
        if theme in motif_costs:
            relevance += motif_costs[theme]
            matching_motifs.append(theme)
    
    # Bonus for matching top motifs
    top_motif_matches = [t for t in puzzle_themes if t in top_motifs]
    
    # Generate rationale
    if top_motif_matches:
        rationale = f"Puzzle matches user's weak motifs: {', '.join(top_motif_matches)}. Highly relevant for training."
    elif matching_motifs:
        rationale = f"Puzzle themes {matching_motifs} have some overlap with user's patterns."
    else:
        rationale = "Puzzle themes don't match user's known weakness patterns."
    
    explain = MotifExplain(
        inputs_used={
            "puzzle_themes": puzzle_themes,
            "matching_motifs": matching_motifs,
            "top_motif_matches": top_motif_matches,
        },
        scoring_rules={
            "relevance": "sum(motif_cost[theme] for theme in puzzle_themes)",
            "top_k": str(len(top_motifs)),
        },
        rationale=rationale,
        top_motifs=top_motifs,
        motif_costs=motif_costs,
        puzzle_motifs=puzzle_themes,
        relevance_score=relevance,
    )
    
    return relevance, explain


def apply_motif_prioritization(
    puzzle: Dict[str, Any],
    motif_costs: Dict[str, float],
    top_motifs: List[str],
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Any]:
    """
    Apply motif cost prioritization to a puzzle.
    
    Adds personal_relevance_score and motif_explain to the puzzle.
    
    Args:
        puzzle: The puzzle candidate dict
        motif_costs: Dict mapping motif to normalized cost
        top_motifs: List of user's top problematic motifs
        ml_config: Optional ML configuration
        
    Returns:
        Updated puzzle dict with personal_relevance_score and motif_explain
    """
    puzzle_themes = puzzle.get("theme", [])
    
    relevance, explain = compute_personal_relevance(
        puzzle_themes=puzzle_themes,
        motif_costs=motif_costs,
        top_motifs=top_motifs,
        ml_config=ml_config,
    )
    
    puzzle["personal_relevance_score"] = relevance
    puzzle["motif_explain"] = explain.model_dump()
    
    return puzzle


def rank_puzzles_by_relevance(
    puzzles: List[Dict[str, Any]],
    motif_costs: Dict[str, float],
    top_motifs: List[str],
    quality_weight: float = 0.6,
    relevance_weight: float = 0.4,
) -> List[Dict[str, Any]]:
    """
    Rank puzzles by combined quality and personal relevance.
    
    Combined score = quality_weight * quality_score + relevance_weight * relevance_score
    
    Args:
        puzzles: List of puzzle dicts (must have quality_score)
        motif_costs: Dict mapping motif to normalized cost
        top_motifs: List of user's top problematic motifs
        quality_weight: Weight for quality score (default 0.6)
        relevance_weight: Weight for relevance score (default 0.4)
        
    Returns:
        Puzzles sorted by combined score (highest first)
    """
    scored_puzzles = []
    
    for puzzle in puzzles:
        # Apply motif prioritization
        puzzle = apply_motif_prioritization(puzzle, motif_costs, top_motifs)
        
        quality_score = puzzle.get("quality_score", 0.5)
        relevance_score = puzzle.get("personal_relevance_score", 0.0)
        
        combined_score = (
            quality_weight * quality_score +
            relevance_weight * relevance_score
        )
        puzzle["combined_score"] = combined_score
        scored_puzzles.append(puzzle)
    
    # Sort by combined score
    scored_puzzles.sort(key=lambda p: p.get("combined_score", 0), reverse=True)
    
    return scored_puzzles


class MotifPrioritizer:
    """
    Tracks and prioritizes puzzles based on user's weakness patterns.
    
    Usage:
        1. Feed mistake motifs from compute_mistake_motifs()
        2. Score individual puzzles with score_puzzle()
        3. Get ranked puzzles with get_ranked_puzzles()
    """
    
    def __init__(
        self,
        mistake_motifs: List[Dict[str, Any]],
        ml_config: Optional["MLConfig"] = None,
    ):
        self.ml_config = ml_config
        self.mistake_motifs = mistake_motifs
        
        # Compute costs and top motifs
        self.motif_costs = compute_motif_costs(mistake_motifs, ml_config)
        
        top_k = 3
        if ml_config and hasattr(ml_config, "motif_top_k"):
            top_k = ml_config.motif_top_k
        self.top_motifs = get_top_motifs(self.motif_costs, top_k)
        
        self.puzzles: List[Dict[str, Any]] = []
    
    def score_puzzle(self, puzzle: Dict[str, Any]) -> Dict[str, Any]:
        """Score a single puzzle and add to tracked puzzles."""
        scored = apply_motif_prioritization(
            puzzle=puzzle,
            motif_costs=self.motif_costs,
            top_motifs=self.top_motifs,
            ml_config=self.ml_config,
        )
        self.puzzles.append(scored)
        return scored
    
    def get_ranked_puzzles(
        self,
        quality_weight: float = 0.6,
        relevance_weight: float = 0.4,
    ) -> List[Dict[str, Any]]:
        """Get all puzzles ranked by combined score."""
        return rank_puzzles_by_relevance(
            puzzles=self.puzzles,
            motif_costs=self.motif_costs,
            top_motifs=self.top_motifs,
            quality_weight=quality_weight,
            relevance_weight=relevance_weight,
        )
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of motif prioritization."""
        return {
            "top_motifs": self.top_motifs,
            "motif_costs": self.motif_costs,
            "total_puzzles": len(self.puzzles),
            "high_relevance_count": sum(
                1 for p in self.puzzles
                if p.get("personal_relevance_score", 0) > 0.2
            ),
            "example_puzzles": [
                {
                    "puzzle_id": p.get("puzzle_id"),
                    "themes": p.get("theme"),
                    "relevance": p.get("personal_relevance_score"),
                }
                for p in sorted(
                    self.puzzles,
                    key=lambda x: x.get("personal_relevance_score", 0),
                    reverse=True
                )[:3]
            ],
        }
