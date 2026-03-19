"""
LC0 Comparison Module.

Generates comparison summaries between baseline and LC0-augmented analysis.
Useful for validating premium value and debugging.
"""

from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


def generate_comparison_summary(
    puzzle_overlay: Optional[Dict[str, Any]],
    repertoire_overlay: Optional[Dict[str, Any]],
    insight_overlay: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Generate a compact diff summary comparing baseline vs LC0 analysis.
    
    Args:
        puzzle_overlay: Puzzle overlay from generate_puzzle_overlay
        repertoire_overlay: Repertoire overlay from generate_repertoire_overlay
        insight_overlay: Insight overlay from generate_insight_overlay
        
    Returns:
        Compact summary dict with key differences
        
    Example output:
        {
            "puzzles_reranked": true,
            "puzzles_with_annotations": 15,
            "repertoire_nodes_analyzed": 8,
            "repertoire_nodes_with_disagreement": 2,
            "extra_insights_count": 3
        }
    """
    summary: Dict[str, Any] = {
        "puzzles_reranked": False,
        "puzzles_with_annotations": 0,
        "repertoire_nodes_analyzed": 0,
        "repertoire_nodes_with_disagreement": 0,
        "extra_insights_count": 0,
    }
    
    # Puzzle comparison
    if puzzle_overlay:
        reranked_ids = puzzle_overlay.get("reranked_puzzle_ids", [])
        annotations = puzzle_overlay.get("puzzle_annotations", {})
        
        summary["puzzles_reranked"] = len(reranked_ids) > 0
        summary["puzzles_with_annotations"] = len(annotations)
        
        # Count puzzles with specific tags
        summary["puzzles_high_tension"] = sum(
            1 for a in annotations.values()
            if "high_tension" in a.get("tags", [])
        )
        summary["puzzles_ambiguous"] = sum(
            1 for a in annotations.values()
            if "ambiguous" in a.get("tags", [])
        )
    
    # Repertoire comparison
    if repertoire_overlay:
        nodes = repertoire_overlay.get("node_suggestions", {})
        summary["repertoire_nodes_analyzed"] = len(nodes)
        summary["repertoire_nodes_with_disagreement"] = sum(
            1 for n in nodes.values()
            if n.get("disagreement", False)
        )
    
    # Insight comparison
    if insight_overlay:
        extra = insight_overlay.get("extra_insights", [])
        summary["extra_insights_count"] = len(extra)
        
        # Count by type
        summary["insights_by_type"] = {}
        for insight in extra:
            itype = insight.get("type", "unknown")
            summary["insights_by_type"][itype] = summary["insights_by_type"].get(itype, 0) + 1
    
    return summary


def generate_debug_diff(
    baseline_report: Dict[str, Any],
    premium_overlays: Dict[str, Any],
    enabled: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Generate detailed dev-only diff for debugging.
    
    Only generated when explicitly enabled (e.g., via ML_DUAL_RUN flag).
    
    Args:
        baseline_report: Original baseline report dict
        premium_overlays: All premium overlays
        enabled: Whether to generate debug diff
        
    Returns:
        Detailed diff dict or None if disabled
    """
    if not enabled:
        return None
    
    diff: Dict[str, Any] = {
        "puzzle_changes": [],
        "repertoire_changes": [],
        "insight_additions": [],
    }
    
    # Puzzle ranking changes
    puzzle_overlay = premium_overlays.get("puzzle_overlays", {})
    if puzzle_overlay:
        baseline_puzzles = baseline_report.get("generated_puzzles", [])
        baseline_order = [p.get("puzzle_id") for p in baseline_puzzles]
        lc0_order = puzzle_overlay.get("reranked_puzzle_ids", [])
        
        if baseline_order != lc0_order:
            # Find puzzles that moved significantly
            for i, pid in enumerate(lc0_order):
                if pid in baseline_order:
                    baseline_idx = baseline_order.index(pid)
                    if abs(i - baseline_idx) >= 3:  # Moved 3+ positions
                        diff["puzzle_changes"].append({
                            "puzzle_id": pid,
                            "baseline_rank": baseline_idx + 1,
                            "lc0_rank": i + 1,
                            "direction": "up" if i < baseline_idx else "down",
                        })
    
    # Repertoire disagreements
    repertoire_overlay = premium_overlays.get("repertoire_overlays", {})
    if repertoire_overlay:
        nodes = repertoire_overlay.get("node_suggestions", {})
        for fen, node_data in nodes.items():
            if node_data.get("disagreement"):
                diff["repertoire_changes"].append({
                    "fen": fen,
                    "lc0_top_move": node_data.get("lc0_top_moves", [{}])[0].get("uci"),
                    "baseline_in_topk": node_data.get("baseline_move_in_topk"),
                })
    
    # Insight additions
    insight_overlay = premium_overlays.get("insight_overlays", {})
    if insight_overlay:
        for insight in insight_overlay.get("extra_insights", []):
            diff["insight_additions"].append({
                "type": insight.get("type"),
                "title": insight.get("title"),
            })
    
    return diff
