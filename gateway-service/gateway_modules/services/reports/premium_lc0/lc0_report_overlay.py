"""
LC0 Report Overlay Generator.

Generates premium report-level augmentations:
- Entropy distribution summary
- Hard position identification
- Style fingerprint based on policy patterns

Provides aggregate LC0 analysis across all sampled positions.
"""

from typing import Dict, List, Any, Optional
import logging
import math

logger = logging.getLogger(__name__)


def generate_report_overlay(
    lc0_results: Dict[str, Dict[str, Any]],
    sampled_positions: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Generate report-level overlay from LC0 evaluations.
    
    Provides aggregate statistics and identifies notable positions.
    
    Args:
        lc0_results: Dict mapping FEN -> LC0 result
        sampled_positions: Optional SampledPositions data for context
        
    Returns:
        Overlay dict with summary statistics, or None if no data
        
    Example output:
        {
            "entropy_summary": {"avg": 2.8, "p90": 3.4, "min": 0.5, "max": 4.2},
            "hard_positions": [
                {"fen": "...", "entropy": 3.6, "context": "turning_point"}
            ],
            "style_fingerprint": {
                "avg_entropy": 2.8,
                "entropy_variance": 0.9,
                "decisive_tendency": 0.65,
                "complexity_preference": "moderate"
            }
        }
    """
    if not lc0_results:
        return None
    
    # Extract all entropy values
    entropies = [
        data.get("policy_entropy", 0) 
        for data in lc0_results.values()
    ]
    
    if not entropies:
        return None
    
    # Compute entropy summary
    entropy_summary = _compute_entropy_summary(entropies)
    
    # Identify hard positions (high entropy)
    hard_positions = _identify_hard_positions(
        lc0_results, sampled_positions, threshold_percentile=90
    )
    
    # Compute style fingerprint
    style_fingerprint = _compute_style_fingerprint(lc0_results)
    
    return {
        "entropy_summary": entropy_summary,
        "hard_positions": hard_positions,
        "style_fingerprint": style_fingerprint,
    }


def _compute_entropy_summary(entropies: List[float]) -> Dict[str, float]:
    """
    Compute summary statistics for entropy distribution.
    """
    if not entropies:
        return {"avg": 0, "p90": 0, "min": 0, "max": 0}
    
    sorted_ent = sorted(entropies)
    n = len(sorted_ent)
    
    avg = sum(entropies) / n
    min_val = sorted_ent[0]
    max_val = sorted_ent[-1]
    
    # 90th percentile
    p90_idx = int(n * 0.9)
    p90 = sorted_ent[min(p90_idx, n - 1)]
    
    # Median
    median = sorted_ent[n // 2]
    
    return {
        "avg": round(avg, 2),
        "median": round(median, 2),
        "p90": round(p90, 2),
        "min": round(min_val, 2),
        "max": round(max_val, 2),
        "count": n,
    }


def _identify_hard_positions(
    lc0_results: Dict[str, Dict[str, Any]],
    sampled_positions: Optional[Dict[str, Any]],
    threshold_percentile: int = 90
) -> List[Dict[str, Any]]:
    """
    Identify positions with high entropy (hard to evaluate).
    """
    # Get all positions with their entropy
    positions_with_entropy = [
        (fen, data.get("policy_entropy", 0))
        for fen, data in lc0_results.items()
    ]
    
    if not positions_with_entropy:
        return []
    
    # Calculate threshold
    entropies = [e for _, e in positions_with_entropy]
    sorted_ent = sorted(entropies)
    threshold_idx = int(len(sorted_ent) * (threshold_percentile / 100))
    threshold = sorted_ent[min(threshold_idx, len(sorted_ent) - 1)]
    
    # Filter to high entropy positions
    hard_positions = []
    for fen, entropy in positions_with_entropy:
        if entropy >= threshold:
            # Determine context from sampled_positions
            context = _determine_position_context(fen, sampled_positions)
            
            hard_positions.append({
                "fen": fen,
                "entropy": round(entropy, 2),
                "context": context,
            })
    
    # Sort by entropy descending
    hard_positions.sort(key=lambda x: x["entropy"], reverse=True)
    
    # Limit to top 10
    return hard_positions[:10]


def _determine_position_context(
    fen: str,
    sampled_positions: Optional[Dict[str, Any]]
) -> str:
    """
    Determine the context/category of a position.
    """
    if not sampled_positions:
        return "unknown"
    
    if fen in sampled_positions.get("puzzle_fens", []):
        return "puzzle"
    elif fen in sampled_positions.get("weak_line_fens", []):
        return "weak_line"
    elif fen in sampled_positions.get("turning_point_fens", []):
        return "turning_point"
    elif fen in sampled_positions.get("opening_fens", []):
        return "opening"
    
    return "other"


def _compute_style_fingerprint(
    lc0_results: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Compute a simple style fingerprint based on LC0 analysis.
    
    This is a first version - can be extended with more features.
    """
    entropies = [data.get("policy_entropy", 0) for data in lc0_results.values()]
    values = [data.get("value", 0) for data in lc0_results.values()]
    
    if not entropies:
        return {}
    
    n = len(entropies)
    avg_entropy = sum(entropies) / n
    
    # Entropy variance
    variance = sum((e - avg_entropy) ** 2 for e in entropies) / n
    entropy_std = math.sqrt(variance)
    
    # Decisive tendency: how often are positions clearly winning/losing?
    decisive_count = sum(1 for v in values if abs(v) > 0.5)
    decisive_tendency = decisive_count / len(values) if values else 0
    
    # Complexity preference based on average entropy
    if avg_entropy < 2.0:
        complexity_preference = "simple"
    elif avg_entropy < 3.0:
        complexity_preference = "moderate"
    else:
        complexity_preference = "complex"
    
    return {
        "avg_entropy": round(avg_entropy, 2),
        "entropy_variance": round(variance, 2),
        "entropy_std": round(entropy_std, 2),
        "decisive_tendency": round(decisive_tendency, 2),
        "complexity_preference": complexity_preference,
    }
