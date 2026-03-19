"""
Trainer Snapshot Service.

Extracts trainer snapshots from existing ML pipeline outputs.
CONSUMES ONLY - no ML, no engine calls, no recomputation.

Inputs consumed:
- RepertoireReport.playstyle_profile (StyleScore)
- RepertoireReport.insights (RepertoireInsight)
- RepertoireReport.weak_lines / generated_puzzles
- Opening residuals (from opening_residuals_service)
"""

import os
import json
import math
from typing import Dict, Any, Optional, List, Literal
from dataclasses import dataclass, field, asdict
from datetime import datetime
from collections import defaultdict

from ..memory.config import ENABLE_PERSISTENT_TRAINER


# =============================================================================
# SNAPSHOT DATA CLASSES
# =============================================================================

@dataclass
class MLTrainerSnapshot:
    """
    Trainer snapshot extracted from ML pipeline outputs.
    
    This consumes existing report data - NO new ML computation.
    """
    snapshot_id: str
    source_report_id: Optional[str]  # Links to originating report
    timestamp: datetime
    
    # Aggregate metrics (from report)
    overall_winrate: float
    total_games: int
    
    # Style scores (from PlaystyleProfile)
    style_vector: List[float]  # [tactical, positional, aggressive, defensive, open, closed]
    style_scores: Dict[str, float]  # Named style scores
    
    # Opening performance (from residuals or report)
    opening_residuals: Dict[str, float]  # ECO -> residual
    opening_winrates: Dict[str, float]  # ECO -> winrate
    
    # Puzzle quality (from generated_puzzles)
    puzzle_count: int
    avg_puzzle_quality: Optional[float]
    
    # Insight counts (from insights)
    insight_counts: Dict[str, int]  # insight_type -> count
    
    # Top motifs (from weak_lines/insights)
    top_motifs: List[str]
    
    # Summary text for vector embedding (optional)
    summary_text: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        return d
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MLTrainerSnapshot":
        if isinstance(data.get("timestamp"), str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        return cls(**data)


# =============================================================================
# SNAPSHOT CACHE (In-Memory, No Schema Change)
# =============================================================================

# user_id -> list of MLTrainerSnapshot (most recent last)
_ml_snapshot_cache: Dict[str, List[MLTrainerSnapshot]] = defaultdict(list)

MAX_SNAPSHOTS_PER_USER = 10


def store_ml_snapshot(user_id: str, snapshot: MLTrainerSnapshot) -> None:
    """Store snapshot in cache."""
    _ml_snapshot_cache[user_id].append(snapshot)
    # Prune old snapshots
    if len(_ml_snapshot_cache[user_id]) > MAX_SNAPSHOTS_PER_USER:
        _ml_snapshot_cache[user_id] = _ml_snapshot_cache[user_id][-MAX_SNAPSHOTS_PER_USER:]


def get_previous_ml_snapshot(user_id: str) -> Optional[MLTrainerSnapshot]:
    """Get most recent snapshot for comparison."""
    snapshots = _ml_snapshot_cache.get(user_id, [])
    return snapshots[-1] if snapshots else None


def get_ml_snapshot_history(user_id: str) -> List[MLTrainerSnapshot]:
    """Get all cached snapshots."""
    return _ml_snapshot_cache.get(user_id, [])


def get_current_ml_snapshot(user_id: str) -> Optional[MLTrainerSnapshot]:
    """Get the current (most recent) snapshot."""
    snapshots = _ml_snapshot_cache.get(user_id, [])
    return snapshots[-1] if snapshots else None


# =============================================================================
# SNAPSHOT EXTRACTION (CONSUMES EXISTING OUTPUTS)
# =============================================================================

def extract_snapshot_from_report(
    report: Dict[str, Any],
    user_id: str,
    report_id: Optional[str] = None
) -> MLTrainerSnapshot:
    """
    Extract a trainer snapshot from an existing RepertoireReport.
    
    CONSUMES ONLY - no ML, no engine calls, no recomputation.
    
    Args:
        report: RepertoireReport data (as dict)
        user_id: User ID
        report_id: Optional report ID for linking
        
    Returns:
        MLTrainerSnapshot extracted from report data
    """
    import uuid
    
    # === 1. Basic metrics ===
    overall_winrate = report.get("overall_winrate", 0.5)
    total_games = report.get("total_games", 0)
    
    # === 2. Extract style scores from PlaystyleProfile ===
    playstyle = report.get("playstyle_profile", {})
    style_vector, style_scores = _extract_style_scores(playstyle)
    
    # === 3. Extract opening performance ===
    opening_residuals, opening_winrates = _extract_opening_performance(report)
    
    # === 4. Extract puzzle quality ===
    puzzles = report.get("generated_puzzles", [])
    puzzle_count = len(puzzles)
    avg_puzzle_quality = _compute_avg_puzzle_quality(puzzles)
    
    # === 5. Extract insight counts ===
    insights = report.get("insights", [])
    insight_counts = _count_insights_by_type(insights)
    
    # === 6. Extract top motifs ===
    top_motifs = _extract_top_motifs(report)
    
    # === 7. Generate summary text for optional vector indexing ===
    summary_text = _generate_snapshot_summary(
        overall_winrate, style_scores, opening_residuals, top_motifs
    )
    
    return MLTrainerSnapshot(
        snapshot_id=str(uuid.uuid4()),
        source_report_id=report_id,
        timestamp=datetime.utcnow(),
        overall_winrate=overall_winrate,
        total_games=total_games,
        style_vector=style_vector,
        style_scores=style_scores,
        opening_residuals=opening_residuals,
        opening_winrates=opening_winrates,
        puzzle_count=puzzle_count,
        avg_puzzle_quality=avg_puzzle_quality,
        insight_counts=insight_counts,
        top_motifs=top_motifs,
        summary_text=summary_text
    )


def _extract_style_scores(playstyle: Dict[str, Any]) -> tuple[List[float], Dict[str, float]]:
    """Extract style vector and scores from PlaystyleProfile."""
    overall = playstyle.get("overall", {})
    
    style_vector = [
        overall.get("tactical", 0.5),
        overall.get("positional", 0.5),
        overall.get("aggressive", 0.5),
        overall.get("defensive", 0.5),
        overall.get("open_positions", 0.5),
        overall.get("closed_positions", 0.5),
    ]
    
    style_scores = {
        "tactical": overall.get("tactical", 0.5),
        "positional": overall.get("positional", 0.5),
        "aggressive": overall.get("aggressive", 0.5),
        "defensive": overall.get("defensive", 0.5),
        "open_positions": overall.get("open_positions", 0.5),
        "closed_positions": overall.get("closed_positions", 0.5),
    }
    
    return style_vector, style_scores


def _extract_opening_performance(report: Dict[str, Any]) -> tuple[Dict[str, float], Dict[str, float]]:
    """Extract opening residuals and winrates from report."""
    residuals: Dict[str, float] = {}
    winrates: Dict[str, float] = {}
    
    # Extract from white repertoire
    for category, group in report.get("white_repertoire", {}).items():
        if not group or not isinstance(group, dict):
            continue
        for opening in group.get("openings", []):
            eco = opening.get("eco_code") or opening.get("eco")
            if eco:
                winrates[eco] = opening.get("winrate", 0.5)
                # Residual might be stored on opening
                if "residual" in opening:
                    residuals[eco] = opening.get("residual", 0.0)
    
    # Extract from black repertoire
    for category, group in report.get("black_repertoire", {}).items():
        if not group or not isinstance(group, dict):
            continue
        for opening in group.get("openings", []):
            eco = opening.get("eco_code") or opening.get("eco")
            if eco:
                winrates[eco] = opening.get("winrate", 0.5)
                if "residual" in opening:
                    residuals[eco] = opening.get("residual", 0.0)
    
    return residuals, winrates


def _compute_avg_puzzle_quality(puzzles: List[Dict[str, Any]]) -> Optional[float]:
    """Compute average puzzle quality score."""
    if not puzzles:
        return None
    
    quality_scores = [p.get("quality_score") for p in puzzles if "quality_score" in p]
    if quality_scores:
        return sum(quality_scores) / len(quality_scores)
    return None


def _count_insights_by_type(insights: List[Dict[str, Any]]) -> Dict[str, int]:
    """Count insights by type."""
    counts: Dict[str, int] = defaultdict(int)
    for insight in insights:
        insight_type = insight.get("type", "general")
        counts[insight_type] += 1
    return dict(counts)


def _extract_top_motifs(report: Dict[str, Any]) -> List[str]:
    """Extract top tactical motifs from weak_lines and insights."""
    motifs: List[str] = []
    
    # From weak lines
    for weak_line in report.get("weak_lines", []):
        for issue in weak_line.get("tactical_issues", []):
            if issue not in motifs:
                motifs.append(issue)
    
    # From insights
    for insight in report.get("insights", []):
        if "motif" in insight:
            if insight["motif"] not in motifs:
                motifs.append(insight["motif"])
    
    return motifs[:10]  # Top 10


def _generate_snapshot_summary(
    winrate: float,
    style_scores: Dict[str, float],
    opening_residuals: Dict[str, float],
    motifs: List[str]
) -> str:
    """Generate summary text for optional vector embedding."""
    parts = []
    
    # Winrate
    parts.append(f"Overall winrate: {winrate:.1%}")
    
    # Dominant style
    if style_scores:
        dominant = max(style_scores.items(), key=lambda x: x[1])
        parts.append(f"Dominant style: {dominant[0]} ({dominant[1]:.2f})")
    
    # Top opening residuals (positive = overperforming)
    if opening_residuals:
        sorted_residuals = sorted(opening_residuals.items(), key=lambda x: x[1], reverse=True)
        if sorted_residuals and sorted_residuals[0][1] > 0.05:
            parts.append(f"Strong in {sorted_residuals[0][0]} (+{sorted_residuals[0][1]:.1%})")
        if len(sorted_residuals) > 1 and sorted_residuals[-1][1] < -0.05:
            parts.append(f"Weak in {sorted_residuals[-1][0]} ({sorted_residuals[-1][1]:.1%})")
    
    # Motifs
    if motifs:
        parts.append(f"Key motifs: {', '.join(motifs[:3])}")
    
    return ". ".join(parts)


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def process_report_for_trainer(
    report: Dict[str, Any],
    user_id: str,
    report_id: Optional[str] = None
) -> Optional[MLTrainerSnapshot]:
    """
    Process a report and create a trainer snapshot.
    
    Feature-flagged - returns None when disabled.
    
    Args:
        report: RepertoireReport data
        user_id: User ID
        report_id: Optional report ID
        
    Returns:
        MLTrainerSnapshot if enabled, None otherwise
    """
    if not ENABLE_PERSISTENT_TRAINER:
        return None
    
    snapshot = extract_snapshot_from_report(report, user_id, report_id)
    store_ml_snapshot(user_id, snapshot)
    
    return snapshot
