"""
Puzzle Quality Scoring Service.

Scores puzzle candidates for quality without discarding any.
This is Step 1 of the ML pipeline augmentation.

Quality components:
- severity: scaled from abs(eval_delta)
- clarity: from multipv_gap if available, else 0.5
- tactical_signal: 1.0 if any motif flagged, else 0.3
- phase_penalty: opening phase reduces final score
- redundancy_penalty: repeated motif+ECO reduces score
"""

from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict

from ..config.ml_config import MLConfig, get_ml_config
from ..models.explain import QualityExplain


# Default weights for quality components
DEFAULT_WEIGHTS = {
    "severity": 0.4,
    "clarity": 0.3,
    "tactical": 0.3,
}

# Tactical patterns that indicate puzzle quality
TACTICAL_MOTIFS = [
    "fork", "pin", "skewer", "xray", "hanging_piece",
    "trapped_piece", "overloaded_piece", "discovered_attack"
]


def compute_severity_score(eval_delta: int) -> float:
    """
    Compute severity score from evaluation delta.
    
    Scaling:
    - 100cp → 0.2
    - 200cp → 0.5
    - 400cp → 0.9
    - 500cp+ → 1.0
    
    Args:
        eval_delta: Absolute centipawn evaluation change
        
    Returns:
        Severity score in [0, 1]
    """
    abs_delta = abs(eval_delta)
    
    if abs_delta <= 100:
        return abs_delta / 500  # 0 to 0.2
    elif abs_delta <= 200:
        return 0.2 + (abs_delta - 100) / 333  # 0.2 to 0.5
    elif abs_delta <= 400:
        return 0.5 + (abs_delta - 200) / 500  # 0.5 to 0.9
    else:
        return min(1.0, 0.9 + (abs_delta - 400) / 1000)  # 0.9 to 1.0


def compute_clarity_score(multipv_gap_cp: Optional[int]) -> float:
    """
    Compute clarity score from MultiPV gap.
    
    Higher gap = clearer single best move = better puzzle.
    
    Args:
        multipv_gap_cp: Gap in centipawns between best and second-best move.
                        None if MultiPV not available.
    
    Returns:
        Clarity score in [0, 1]
    """
    if multipv_gap_cp is None:
        return 0.5  # Default when MultiPV not available
    
    # Scaling: 0cp → 0.0, 150cp → 0.5, 300cp+ → 1.0
    return min(1.0, multipv_gap_cp / 300)


def compute_tactical_score(heuristics: Dict[str, Any]) -> float:
    """
    Compute tactical signal score from heuristics.
    
    Args:
        heuristics: Dict with boolean flags for tactical patterns
        
    Returns:
        1.0 if any tactical motif present, 0.3 otherwise
    """
    for motif in TACTICAL_MOTIFS:
        if heuristics.get(motif, False):
            return 1.0
    return 0.3


def compute_phase_penalty(phase: str, ml_config: Optional[MLConfig] = None) -> float:
    """
    Compute phase-based penalty.
    
    Opening puzzles are often just "book moves" and less instructive.
    
    Args:
        phase: "opening", "middlegame", or "endgame"
        ml_config: Configuration with penalty value
        
    Returns:
        Multiplier in [0, 1] (1.0 = no penalty)
    """
    config = ml_config or get_ml_config()
    
    if phase == "opening":
        return config.quality_opening_phase_penalty
    return 1.0


def compute_redundancy_penalty(
    eco: Optional[str],
    motifs: List[str],
    motif_eco_counts: Dict[Tuple[str, str], int],
    ml_config: Optional[MLConfig] = None
) -> float:
    """
    Compute redundancy penalty for repeated motif+ECO combinations.
    
    If the same motif appears many times in the same opening,
    later occurrences are less valuable for training.
    
    Args:
        eco: ECO code of the puzzle
        motifs: List of motifs in this puzzle
        motif_eco_counts: Running count of (motif, eco) occurrences
        ml_config: Configuration with threshold and factor
        
    Returns:
        Multiplier in [0, 1] (1.0 = no penalty)
    """
    config = ml_config or get_ml_config()
    
    if not eco or not motifs:
        return 1.0
    
    max_count = 0
    for motif in motifs:
        key = (motif, eco)
        count = motif_eco_counts.get(key, 0)
        max_count = max(max_count, count)
    
    if max_count >= config.quality_redundancy_penalty_threshold:
        # Apply cumulative penalty for repeated occurrences
        excess = max_count - config.quality_redundancy_penalty_threshold + 1
        penalty = config.quality_redundancy_penalty_factor ** excess
        return max(0.1, penalty)  # Floor at 0.1
    
    return 1.0


def compute_puzzle_quality(
    puzzle: Dict[str, Any],
    eval_delta: int,
    heuristics: Dict[str, Any],
    phase: str,
    motif_eco_counts: Dict[Tuple[str, str], int],
    multipv_gap_cp: Optional[int] = None,
    ml_config: Optional[MLConfig] = None
) -> Tuple[float, Dict[str, float], QualityExplain]:
    """
    Compute quality score for a puzzle candidate.
    
    Does NOT discard puzzles - only scores and ranks them.
    
    Args:
        puzzle: The puzzle candidate dict
        eval_delta: Evaluation delta that triggered the puzzle
        heuristics: Tactical heuristics for the position
        phase: Game phase ("opening", "middlegame", "endgame")
        motif_eco_counts: Running count of motif+ECO occurrences
        multipv_gap_cp: Optional MultiPV gap from Step 2
        ml_config: ML configuration
        
    Returns:
        Tuple of (quality_score, quality_components, explain)
    """
    config = ml_config or get_ml_config()
    
    # Extract motifs from puzzle
    motifs = puzzle.get("theme", [])
    eco = puzzle.get("eco")
    
    # Compute component scores
    severity = compute_severity_score(eval_delta)
    clarity = compute_clarity_score(multipv_gap_cp)
    tactical = compute_tactical_score(heuristics)
    
    # Compute penalties
    phase_mult = compute_phase_penalty(phase, config)
    redundancy_mult = compute_redundancy_penalty(eco, motifs, motif_eco_counts, config)
    
    # Weighted sum of components
    w_severity = config.quality_weight_severity
    w_clarity = config.quality_weight_clarity
    w_tactical = config.quality_weight_tactical
    
    weighted_score = (
        w_severity * severity +
        w_clarity * clarity +
        w_tactical * tactical
    )
    
    # Apply penalties
    final_score = weighted_score * phase_mult * redundancy_mult
    final_score = max(0.0, min(1.0, final_score))  # Clamp to [0, 1]
    
    # Build components dict
    components = {
        "severity": severity,
        "clarity": clarity,
        "tactical_signal": tactical,
        "phase_penalty": phase_mult,
        "redundancy_penalty": redundancy_mult,
        "weighted_score": weighted_score,
    }
    
    # Build explain object
    explain = QualityExplain(
        inputs_used={
            "eval_delta": eval_delta,
            "multipv_gap_cp": multipv_gap_cp,
            "has_tactical_motif": tactical == 1.0,
            "phase": phase,
            "eco": eco,
            "motifs": motifs,
        },
        scoring_rules={
            "severity": f"abs({eval_delta})/400, scaled and capped at 1.0",
            "clarity": "multipv_gap/300" if multipv_gap_cp else "default 0.5 (no MultiPV)",
            "tactical_signal": "1.0 if any motif else 0.3",
            "phase_penalty": f"{phase_mult} for {phase} phase",
            "redundancy_penalty": f"{redundancy_mult:.2f} based on motif+ECO repetition",
        },
        rationale=_generate_rationale(severity, clarity, tactical, phase_mult, redundancy_mult, final_score),
        severity_score=severity,
        clarity_score=clarity,
        tactical_score=tactical,
        phase_penalty=phase_mult,
        redundancy_penalty=redundancy_mult,
        weighted_score=weighted_score,
        final_score=final_score,
    )
    
    return final_score, components, explain


def _generate_rationale(
    severity: float,
    clarity: float,
    tactical: float,
    phase_mult: float,
    redundancy_mult: float,
    final_score: float
) -> str:
    """Generate human-readable rationale for the quality score."""
    parts = []
    
    # Severity assessment
    if severity >= 0.7:
        parts.append(f"High severity ({severity:.2f})")
    elif severity >= 0.4:
        parts.append(f"Medium severity ({severity:.2f})")
    else:
        parts.append(f"Low severity ({severity:.2f})")
    
    # Tactical assessment
    if tactical == 1.0:
        parts.append("tactical motif detected")
    else:
        parts.append("no specific tactical motif")
    
    # Clarity assessment
    if clarity >= 0.7:
        parts.append("clear best move")
    elif clarity <= 0.3:
        parts.append("ambiguous position")
    
    # Penalties
    penalties = []
    if phase_mult < 1.0:
        penalties.append("opening phase")
    if redundancy_mult < 1.0:
        penalties.append("repeated pattern")
    
    rationale = " + ".join(parts)
    if penalties:
        rationale += f" (penalized for: {', '.join(penalties)})"
    rationale += f" = quality_score {final_score:.2f}"
    
    return rationale


class PuzzleQualityTracker:
    """
    Tracks puzzle quality metrics across a bulk import.
    
    Maintains running counts for redundancy detection and
    computes aggregate statistics for the report.
    """
    
    def __init__(self, ml_config: Optional[MLConfig] = None):
        self.config = ml_config or get_ml_config()
        self.puzzles: List[Dict[str, Any]] = []
        self.motif_eco_counts: Dict[Tuple[str, str], int] = defaultdict(int)
        self.quality_scores: List[float] = []
    
    def score_puzzle(
        self,
        puzzle: Dict[str, Any],
        eval_delta: int,
        heuristics: Dict[str, Any],
        phase: str,
        multipv_gap_cp: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Score a puzzle and track it.
        
        Args:
            puzzle: Puzzle candidate dict (modified in place)
            eval_delta: Evaluation delta
            heuristics: Tactical heuristics
            phase: Game phase
            multipv_gap_cp: Optional MultiPV gap
            
        Returns:
            The puzzle dict with quality_score, quality_components, and explain added
        """
        # Compute quality score
        score, components, explain = compute_puzzle_quality(
            puzzle=puzzle,
            eval_delta=eval_delta,
            heuristics=heuristics,
            phase=phase,
            motif_eco_counts=self.motif_eco_counts,
            multipv_gap_cp=multipv_gap_cp,
            ml_config=self.config,
        )
        
        # Add to puzzle
        puzzle["quality_score"] = score
        puzzle["quality_components"] = components
        puzzle["explain"] = explain.model_dump()
        
        # Update tracking
        self.puzzles.append(puzzle)
        self.quality_scores.append(score)
        
        # Update motif+ECO counts for redundancy tracking
        eco = puzzle.get("eco")
        motifs = puzzle.get("theme", [])
        if eco:
            for motif in motifs:
                self.motif_eco_counts[(motif, eco)] += 1
        
        return puzzle
    
    def get_summary(self) -> Dict[str, Any]:
        """
        Get summary statistics for the report.
        
        Returns:
            Dict with puzzle quality summary
        """
        if not self.quality_scores:
            return {
                "total_candidates": 0,
                "mean_score": 0.0,
                "median_score": 0.0,
                "top_quartile_count": 0,
                "top_motifs": [],
            }
        
        sorted_scores = sorted(self.quality_scores, reverse=True)
        n = len(sorted_scores)
        
        # Compute top quartile threshold
        q75_idx = n // 4
        top_quartile_threshold = sorted_scores[q75_idx] if q75_idx < n else 0.0
        
        # Count motifs in top quartile puzzles
        top_quartile_puzzles = [p for p in self.puzzles if p.get("quality_score", 0) >= top_quartile_threshold]
        motif_counts: Dict[str, int] = defaultdict(int)
        for puzzle in top_quartile_puzzles:
            for motif in puzzle.get("theme", []):
                motif_counts[motif] += 1
        
        top_motifs = sorted(motif_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return {
            "total_candidates": n,
            "mean_score": sum(self.quality_scores) / n,
            "median_score": sorted_scores[n // 2],
            "top_quartile_count": len(top_quartile_puzzles),
            "top_quartile_threshold": top_quartile_threshold,
            "top_motifs": [{"motif": m, "count": c} for m, c in top_motifs],
            "score_distribution": {
                "0.0-0.2": sum(1 for s in sorted_scores if s < 0.2),
                "0.2-0.4": sum(1 for s in sorted_scores if 0.2 <= s < 0.4),
                "0.4-0.6": sum(1 for s in sorted_scores if 0.4 <= s < 0.6),
                "0.6-0.8": sum(1 for s in sorted_scores if 0.6 <= s < 0.8),
                "0.8-1.0": sum(1 for s in sorted_scores if s >= 0.8),
            },
        }
    
    def get_top_puzzles(self, n: int = 10) -> List[Dict[str, Any]]:
        """Get top N puzzles by quality score."""
        return sorted(
            self.puzzles,
            key=lambda p: p.get("quality_score", 0),
            reverse=True
        )[:n]
