"""
LC0 Insight Overlay Generator.

Generates premium insights based on LC0 analysis:
- Positional disagreements (LC0 vs Stockfish preferences)
- Tension handling patterns
- Conversion difficulty flags

All insights include explicit evidence (FEN, moves, values).
"""

from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

# Insight type constants
INSIGHT_LC0_DISAGREEMENT = "lc0_disagreement"
INSIGHT_CONVERSION_DIFFICULTY = "conversion_difficulty"
INSIGHT_TENSION_HANDLING = "tension_handling"


def generate_insight_overlay(
    baseline_insights: List[Dict[str, Any]],
    lc0_results: Dict[str, Dict[str, Any]],
    turning_point_fens: List[str],
    baseline_moves: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Generate insight overlay from LC0 evaluations.
    
    Detects patterns that LC0 reveals but baseline Stockfish analysis doesn't:
    - Positional disagreements (different preferred moves)
    - Conversion difficulty (winning eval but high entropy)
    - Tension patterns across turning points
    
    Args:
        baseline_insights: List of baseline insight dicts
        lc0_results: Dict mapping FEN -> LC0 result
        turning_point_fens: FENs of high eval-swing positions
        baseline_moves: Optional dict of FEN -> baseline best move data
        
    Returns:
        Overlay dict with extra insights, or None if no data
        
    Example output:
        {
            "extra_insights": [
                {
                    "type": "lc0_disagreement",
                    "title": "Positional preference differs from Stockfish",
                    "severity": "info",
                    "evidence": {
                        "fen": "...",
                        "baseline_best": "e2e4",
                        "lc0_top": "g2g4",
                        "lc0_entropy": 3.1
                    }
                }
            ]
        }
    """
    if not lc0_results:
        return None
    
    extra_insights: List[Dict[str, Any]] = []
    
    # Analyze turning points for patterns
    if turning_point_fens:
        turning_point_insights = _analyze_turning_points(
            turning_point_fens, lc0_results, baseline_moves
        )
        extra_insights.extend(turning_point_insights)
    
    # Detect conversion difficulty positions
    conversion_insights = _detect_conversion_difficulty(lc0_results)
    extra_insights.extend(conversion_insights)
    
    # Detect tension handling patterns
    tension_insights = _analyze_tension_patterns(lc0_results)
    extra_insights.extend(tension_insights)
    
    if not extra_insights:
        return None
    
    # Limit to most important insights
    extra_insights = extra_insights[:10]
    
    return {
        "extra_insights": extra_insights,
    }


def _analyze_turning_points(
    turning_point_fens: List[str],
    lc0_results: Dict[str, Dict[str, Any]],
    baseline_moves: Optional[Dict[str, Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Analyze turning points for LC0 vs baseline disagreements.
    """
    insights = []
    
    for fen in turning_point_fens:
        lc0_data = lc0_results.get(fen)
        if not lc0_data:
            continue
        
        policy_topk = lc0_data.get("policy_topk", [])
        entropy = lc0_data.get("policy_entropy", 0)
        
        if not policy_topk:
            continue
        
        lc0_top = policy_topk[0].get("uci", "")
        
        # Get baseline best move if available
        baseline_best = None
        if baseline_moves and fen in baseline_moves:
            baseline_best = baseline_moves[fen].get("best_move")
        
        # Check for disagreement
        if baseline_best and lc0_top and baseline_best != lc0_top:
            # Check if it's a significant disagreement
            top_prob = policy_topk[0].get("p", 0)
            if top_prob > 0.25:  # LC0 is confident about its choice
                insights.append({
                    "type": INSIGHT_LC0_DISAGREEMENT,
                    "title": "Positional preference differs from Stockfish",
                    "severity": "info",
                    "evidence": {
                        "fen": fen,
                        "baseline_best": baseline_best,
                        "lc0_top": lc0_top,
                        "lc0_top_probability": round(top_prob, 3),
                        "lc0_entropy": round(entropy, 2),
                    }
                })
    
    return insights


def _detect_conversion_difficulty(
    lc0_results: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Detect positions that are winning but hard to convert.
    
    Criteria:
    - Value > 0.5 (clearly winning for one side)
    - Entropy > 2.5 (many reasonable moves = unclear technique)
    """
    insights = []
    difficult_positions = []
    
    for fen, data in lc0_results.items():
        value = abs(data.get("value", 0))
        entropy = data.get("policy_entropy", 0)
        
        # Winning but high entropy = difficult to convert
        if value > 0.5 and entropy > 2.5:
            difficult_positions.append({
                "fen": fen,
                "value": value,
                "entropy": entropy,
            })
    
    if difficult_positions:
        # Sort by difficulty (high entropy in winning positions)
        difficult_positions.sort(key=lambda x: x["entropy"], reverse=True)
        
        # Take top 3 examples
        top_examples = difficult_positions[:3]
        
        insights.append({
            "type": INSIGHT_CONVERSION_DIFFICULTY,
            "title": "Some winning positions may be difficult to convert",
            "severity": "warning",
            "evidence": {
                "count": len(difficult_positions),
                "avg_entropy": round(
                    sum(p["entropy"] for p in difficult_positions) / len(difficult_positions), 2
                ),
                "examples": [
                    {
                        "fen": p["fen"],
                        "value": round(p["value"], 3),
                        "entropy": round(p["entropy"], 2),
                    }
                    for p in top_examples
                ]
            }
        })
    
    return insights


def _analyze_tension_patterns(
    lc0_results: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Analyze entropy patterns to detect tension handling tendencies.
    """
    insights = []
    
    if len(lc0_results) < 5:
        return insights
    
    entropies = [data.get("policy_entropy", 0) for data in lc0_results.values()]
    avg_entropy = sum(entropies) / len(entropies)
    
    # High entropy positions (tense/unclear)
    high_tension_count = sum(1 for e in entropies if e > 3.0)
    high_tension_ratio = high_tension_count / len(entropies)
    
    if high_tension_ratio > 0.4:
        insights.append({
            "type": INSIGHT_TENSION_HANDLING,
            "title": "Many positions with high strategic tension",
            "severity": "info",
            "evidence": {
                "high_tension_count": high_tension_count,
                "total_positions": len(entropies),
                "ratio": round(high_tension_ratio, 2),
                "avg_entropy": round(avg_entropy, 2),
                "interpretation": (
                    "High tension positions require careful calculation. "
                    "Consider whether you're making clear decisions or second-guessing."
                )
            }
        })
    
    return insights
