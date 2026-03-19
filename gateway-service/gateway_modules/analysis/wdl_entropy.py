"""
WDL Entropy Analysis Module

Computes Shannon entropy for Win/Draw/Loss probabilities to measure
position clarity (decisive vs uncertain).

This is a diagnostic meta-signal, not an evaluation replacement.
"""

import math
from typing import Dict, Optional


def compute_wdl_entropy(w: float, d: float, l: float) -> float:
    """
    Compute Shannon entropy for W/D/L probabilities.
    
    Args:
        w: Win probability [0, 1]
        d: Draw probability [0, 1]
        l: Loss probability [0, 1]
        
    Returns:
        Entropy in bits. Range: 0 (certain) to ~1.58 (maximum uncertainty)
        
    Notes:
        H = -Σ p * log2(p)
        Maximum entropy for 3 outcomes = log2(3) ≈ 1.585 bits
    """
    # Clamp to avoid log(0)
    eps = 1e-10
    probs = [max(p, eps) for p in [w, d, l]]
    
    # Normalize in case they don't sum to 1
    total = sum(probs)
    if total > 0:
        probs = [p / total for p in probs]
    
    # Shannon entropy
    entropy = -sum(p * math.log2(p) for p in probs if p > eps)
    return entropy


def compute_entropy_delta(
    wdl_before: Optional[Dict[str, float]],
    wdl_after: Optional[Dict[str, float]],
) -> Optional[Dict[str, float]]:
    """
    Compute entropy change between two positions.
    
    Args:
        wdl_before: {"w": float, "d": float, "l": float} before move
        wdl_after: {"w": float, "d": float, "l": float} after move
        
    Returns:
        Dict with entropy values and interpretation, or None if unavailable.
        
    Interpretation thresholds:
        delta < -0.15 → "position becomes more decisive"
        delta > +0.15 → "position becomes more uncertain"
        otherwise → "no significant change in uncertainty"
    """
    if not wdl_before or not wdl_after:
        return None
    
    try:
        entropy_before = compute_wdl_entropy(
            wdl_before.get("w", 0),
            wdl_before.get("d", 0),
            wdl_before.get("l", 0),
        )
        entropy_after = compute_wdl_entropy(
            wdl_after.get("w", 0),
            wdl_after.get("d", 0),
            wdl_after.get("l", 0),
        )
        
        delta = entropy_after - entropy_before
        
        # Interpret delta
        if delta < -0.15:
            interpretation = "position becomes more decisive"
        elif delta > 0.15:
            interpretation = "position becomes more uncertain"
        else:
            interpretation = "no significant change in uncertainty"
        
        return {
            "before": round(entropy_before, 3),
            "after": round(entropy_after, 3),
            "delta": round(delta, 3),
            "interpretation": interpretation,
        }
        
    except (KeyError, TypeError, ValueError):
        return None


def format_entropy_for_llm(entropy_data: Optional[Dict]) -> Optional[str]:
    """
    Format entropy data for LLM context (non-numerical).
    
    Only used when concept deltas are ambiguous.
    Returns None if entropy is not meaningful.
    """
    if not entropy_data:
        return None
    
    interpretation = entropy_data.get("interpretation", "")
    delta = entropy_data.get("delta", 0)
    
    # Only mention if significant
    if abs(delta) < 0.15:
        return None
    
    if delta < -0.15:
        return "The move clarifies the position, making the outcome more decisive."
    elif delta > 0.15:
        return "The move introduces complexity, making the outcome less certain."
    
    return None
