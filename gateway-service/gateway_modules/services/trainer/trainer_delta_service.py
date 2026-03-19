"""
Trainer Delta Service.

Computes deltas between ML trainer snapshots.
Pure arithmetic - NO ML, NO LLM, NO heuristics beyond thresholds.
"""

import math
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict

from .trainer_snapshot_service import MLTrainerSnapshot


# =============================================================================
# DELTA DATA CLASS
# =============================================================================

@dataclass
class TrainerDelta:
    """
    Delta between two trainer snapshots.
    
    All deltas are current - previous (positive = improvement for most metrics).
    """
    # Time between snapshots
    days_between: float
    
    # Aggregate metric deltas
    overall_winrate_delta: float
    games_delta: int
    puzzle_quality_delta: Optional[float]
    
    # Opening residual deltas (ECO -> delta)
    opening_residual_deltas: Dict[str, float]
    opening_winrate_deltas: Dict[str, float]
    
    # Style evolution
    style_similarity: float  # Cosine similarity between style vectors
    style_score_deltas: Dict[str, float]  # tactical_delta, etc.
    
    # Insight/motif deltas
    insight_count_deltas: Dict[str, int]
    motif_changes: Dict[str, str]  # motif -> "added" | "removed"
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# DELTA COMPUTATION (PURE ARITHMETIC)
# =============================================================================

def compute_trainer_delta(
    current: MLTrainerSnapshot,
    previous: Optional[MLTrainerSnapshot]
) -> TrainerDelta:
    """
    Compute delta between current and previous snapshot.
    
    Pure arithmetic - NO ML, NO LLM.
    
    Args:
        current: Current snapshot
        previous: Previous snapshot (or None for first)
        
    Returns:
        TrainerDelta with computed differences
    """
    if previous is None:
        # First snapshot - no deltas
        return TrainerDelta(
            days_between=0,
            overall_winrate_delta=0,
            games_delta=current.total_games,
            puzzle_quality_delta=None,
            opening_residual_deltas={},
            opening_winrate_deltas={},
            style_similarity=1.0,  # Same as itself
            style_score_deltas={},
            insight_count_deltas={},
            motif_changes={}
        )
    
    # Time between snapshots
    days_between = (current.timestamp - previous.timestamp).total_seconds() / 86400
    
    # Aggregate deltas
    winrate_delta = round(current.overall_winrate - previous.overall_winrate, 4)
    games_delta = current.total_games - previous.total_games
    
    # Puzzle quality delta
    puzzle_delta = None
    if current.avg_puzzle_quality is not None and previous.avg_puzzle_quality is not None:
        puzzle_delta = round(current.avg_puzzle_quality - previous.avg_puzzle_quality, 4)
    
    # Opening residual deltas (only for common openings)
    residual_deltas = _compute_dict_deltas(
        current.opening_residuals, previous.opening_residuals
    )
    
    # Opening winrate deltas
    winrate_deltas = _compute_dict_deltas(
        current.opening_winrates, previous.opening_winrates
    )
    
    # Style similarity (cosine)
    style_similarity = _cosine_similarity(current.style_vector, previous.style_vector)
    
    # Style score deltas
    style_score_deltas = {}
    for key in current.style_scores:
        if key in previous.style_scores:
            delta = current.style_scores[key] - previous.style_scores[key]
            if abs(delta) >= 0.01:  # Only meaningful deltas
                style_score_deltas[f"{key}_delta"] = round(delta, 4)
    
    # Insight count deltas
    insight_deltas = {}
    all_types = set(current.insight_counts.keys()) | set(previous.insight_counts.keys())
    for insight_type in all_types:
        curr_count = current.insight_counts.get(insight_type, 0)
        prev_count = previous.insight_counts.get(insight_type, 0)
        delta = curr_count - prev_count
        if delta != 0:
            insight_deltas[insight_type] = delta
    
    # Motif changes
    motif_changes = {}
    curr_motifs = set(current.top_motifs)
    prev_motifs = set(previous.top_motifs)
    for motif in curr_motifs - prev_motifs:
        motif_changes[motif] = "added"
    for motif in prev_motifs - curr_motifs:
        motif_changes[motif] = "removed"
    
    return TrainerDelta(
        days_between=round(days_between, 2),
        overall_winrate_delta=winrate_delta,
        games_delta=games_delta,
        puzzle_quality_delta=puzzle_delta,
        opening_residual_deltas=residual_deltas,
        opening_winrate_deltas=winrate_deltas,
        style_similarity=round(style_similarity, 4),
        style_score_deltas=style_score_deltas,
        insight_count_deltas=insight_deltas,
        motif_changes=motif_changes
    )


def _compute_dict_deltas(
    current: Dict[str, float],
    previous: Dict[str, float]
) -> Dict[str, float]:
    """Compute deltas for common keys in two dicts."""
    deltas = {}
    for key in current:
        if key in previous:
            delta = current[key] - previous[key]
            if abs(delta) >= 0.01:  # Only meaningful deltas
                deltas[key] = round(delta, 4)
    return deltas


def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(vec1) != len(vec2) or not vec1:
        return 0.5
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(b * b for b in vec2))
    
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.5
    
    similarity = dot_product / (magnitude1 * magnitude2)
    return max(0.0, min(1.0, similarity))  # Clamp to [0, 1]


# =============================================================================
# DELTA SUMMARY HELPERS
# =============================================================================

def summarize_delta(delta: TrainerDelta) -> Dict[str, Any]:
    """Create a summary of the most significant changes."""
    summary = {
        "days_between": delta.days_between,
        "games_played": delta.games_delta,
        "winrate_change": delta.overall_winrate_delta,
    }
    
    # Top improving openings
    if delta.opening_residual_deltas:
        sorted_residuals = sorted(
            delta.opening_residual_deltas.items(),
            key=lambda x: x[1],
            reverse=True
        )
        if sorted_residuals and sorted_residuals[0][1] > 0.03:
            summary["top_improving_opening"] = {
                "eco": sorted_residuals[0][0],
                "delta": sorted_residuals[0][1]
            }
        if len(sorted_residuals) > 1 and sorted_residuals[-1][1] < -0.03:
            summary["top_declining_opening"] = {
                "eco": sorted_residuals[-1][0],
                "delta": sorted_residuals[-1][1]
            }
    
    # Style evolution
    if delta.style_similarity < 0.9:
        summary["style_evolved"] = True
        summary["style_similarity"] = delta.style_similarity
    
    return summary
