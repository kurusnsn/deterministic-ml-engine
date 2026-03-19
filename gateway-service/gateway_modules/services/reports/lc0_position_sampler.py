"""
LC0 Position Sampler.

Deterministic position sampling for cost-controlled LC0 evaluation.
Selects key positions from reports for premium augmentation.
"""

import hashlib
import random
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set
import logging

logger = logging.getLogger(__name__)


@dataclass
class SampledPositions:
    """
    Positions selected for LC0 evaluation.
    
    Positions are deduplicated by FEN and organized by category
    for targeted overlay generation.
    """
    puzzle_fens: List[str] = field(default_factory=list)
    weak_line_fens: List[str] = field(default_factory=list)
    opening_fens: List[str] = field(default_factory=list)
    turning_point_fens: List[str] = field(default_factory=list)
    
    @property
    def total_count(self) -> int:
        """Total unique positions across all categories."""
        all_fens = set(self.puzzle_fens + self.weak_line_fens + 
                       self.opening_fens + self.turning_point_fens)
        return len(all_fens)
    
    @property
    def all_fens(self) -> List[str]:
        """All unique FENs in deterministic order."""
        seen: Set[str] = set()
        result = []
        for fen in (self.puzzle_fens + self.weak_line_fens + 
                    self.opening_fens + self.turning_point_fens):
            if fen not in seen:
                seen.add(fen)
                result.append(fen)
        return result
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "puzzle_fens": self.puzzle_fens,
            "weak_line_fens": self.weak_line_fens,
            "opening_fens": self.opening_fens,
            "turning_point_fens": self.turning_point_fens,
            "total_count": self.total_count,
        }


def sample_positions_for_lc0(
    report: Dict[str, Any],
    max_positions: int = 80,
    seed: Optional[int] = None
) -> SampledPositions:
    """
    Deterministic sampling from report data for LC0 evaluation.
    
    Samples key positions that will benefit most from LC0 analysis:
    - Puzzle positions (blunders/mistakes)
    - Weak line critical nodes
    - Turning points (high eval swings)
    - Opening transition positions
    
    The sampling is deterministic given fixed inputs and seed,
    ensuring reproducible results for testing and debugging.
    
    Args:
        report: RepertoireReport data (dict or model)
        max_positions: Maximum total positions to sample (40-120 typical)
        seed: Optional random seed for deterministic sampling
        
    Returns:
        SampledPositions with categorized FENs
        
    Example:
        >>> report = generate_repertoire_report(...)
        >>> positions = sample_positions_for_lc0(report.model_dump(), max_positions=80)
        >>> lc0_results = lc0_service.evaluate_positions(positions.all_fens)
    """
    # Convert model to dict if needed
    if hasattr(report, 'model_dump'):
        report = report.model_dump()
    
    # Initialize RNG for deterministic overflow sampling
    rng = random.Random(seed) if seed is not None else random.Random()
    
    # Allocate budget by priority
    # Priority: puzzles > weak lines > turning points > openings
    puzzle_budget = max_positions // 3  # ~27 for 80
    weak_line_budget = max_positions // 4  # ~20 for 80
    turning_point_budget = max_positions // 4  # ~20 for 80
    opening_budget = max_positions - puzzle_budget - weak_line_budget - turning_point_budget  # ~13 for 80
    
    result = SampledPositions()
    
    # 1. Sample puzzle positions (highest priority)
    puzzles = report.get("generated_puzzles", []) or []
    result.puzzle_fens = _sample_puzzle_fens(puzzles, puzzle_budget, rng)
    
    # 2. Sample weak line positions
    weak_lines = report.get("weak_lines", []) or []
    result.weak_line_fens = _sample_weak_line_fens(weak_lines, weak_line_budget, rng)
    
    # 3. Sample turning points (high eval swing positions)
    engine_analysis = report.get("engine_analysis", {}) or {}
    moves = engine_analysis.get("moves", []) or []
    result.turning_point_fens = _sample_turning_point_fens(moves, turning_point_budget, rng)
    
    # 4. Sample opening positions
    white_rep = report.get("white_repertoire", {}) or {}
    black_rep = report.get("black_repertoire", {}) or {}
    result.opening_fens = _sample_opening_fens(
        white_rep, black_rep, moves, opening_budget, rng
    )
    
    logger.info(
        f"LC0 position sampling complete: "
        f"puzzles={len(result.puzzle_fens)}, "
        f"weak_lines={len(result.weak_line_fens)}, "
        f"turning_points={len(result.turning_point_fens)}, "
        f"openings={len(result.opening_fens)}, "
        f"total_unique={result.total_count}"
    )
    
    return result


def _sample_puzzle_fens(
    puzzles: List[Dict[str, Any]],
    budget: int,
    rng: random.Random
) -> List[str]:
    """
    Sample puzzle FENs by priority (blunders first, then mistakes).
    """
    if not puzzles:
        return []
    
    # Separate by mistake type
    blunders = [p for p in puzzles if p.get("mistake_type") == "blunder"]
    mistakes = [p for p in puzzles if p.get("mistake_type") == "mistake"]
    others = [p for p in puzzles if p.get("mistake_type") not in ("blunder", "mistake")]
    
    fens = []
    
    # Add all blunders first (they're most important)
    for p in blunders[:budget]:
        fen = p.get("fen")
        if fen and fen not in fens:
            fens.append(fen)
    
    # Then mistakes
    remaining = budget - len(fens)
    if remaining > 0:
        for p in mistakes[:remaining]:
            fen = p.get("fen")
            if fen and fen not in fens:
                fens.append(fen)
    
    # Then others if we still have budget
    remaining = budget - len(fens)
    if remaining > 0:
        for p in others[:remaining]:
            fen = p.get("fen")
            if fen and fen not in fens:
                fens.append(fen)
    
    return fens


def _sample_weak_line_fens(
    weak_lines: List[Dict[str, Any]],
    budget: int,
    rng: random.Random
) -> List[str]:
    """
    Sample critical positions from weak lines.
    
    For each weak line, we want the position after the problematic move sequence.
    Since we don't have FENs directly stored in weak lines, we'll need to
    extract them from associated puzzle data or move analysis.
    """
    if not weak_lines:
        return []
    
    fens = []
    
    # Sort weak lines by impact (avg_eval_swing * games_count)
    sorted_lines = sorted(
        weak_lines,
        key=lambda wl: abs(wl.get("avg_eval_swing", 0)) * wl.get("games_count", 1),
        reverse=True
    )
    
    # Take top weak lines up to budget
    # Each weak line contributes ~1 position
    for wl in sorted_lines[:budget]:
        # Try to get FEN from linked puzzle
        puzzle_ids = wl.get("puzzle_ids", [])
        if puzzle_ids:
            # We don't have direct access to puzzle FENs here
            # The caller should cross-reference with puzzles
            pass
        
        # For now, weak line FENs need to be extracted elsewhere
        # This is a placeholder - the full implementation would
        # trace the move sequence to get the critical FEN
    
    return fens


def _sample_turning_point_fens(
    moves: List[Dict[str, Any]],
    budget: int,
    rng: random.Random
) -> List[str]:
    """
    Sample positions where evaluation swung significantly.
    
    Turning points are positions where:
    - Eval delta > 100cp (significant swing)
    - Often mistakes/blunders but also missed opportunities
    """
    if not moves:
        return []
    
    # Find moves with significant eval swings
    turning_points = []
    for move in moves:
        eval_delta = abs(move.get("eval_delta", 0))
        if eval_delta >= 100:  # 1 pawn or more
            fen = move.get("fen_before")
            if fen:
                turning_points.append({
                    "fen": fen,
                    "delta": eval_delta,
                    "ply": move.get("ply", 0)
                })
    
    # Sort by magnitude of swing
    turning_points.sort(key=lambda x: x["delta"], reverse=True)
    
    # Take top positions up to budget
    fens = []
    for tp in turning_points[:budget]:
        fen = tp["fen"]
        if fen not in fens:
            fens.append(fen)
    
    return fens


def _sample_opening_fens(
    white_rep: Dict[str, Any],
    black_rep: Dict[str, Any],
    moves: List[Dict[str, Any]],
    budget: int,
    rng: random.Random
) -> List[str]:
    """
    Sample 1-2 positions per major opening group.
    
    Focus on opening transition points (ply 6-20) where
    the player leaves book or makes defining choices.
    """
    if not moves:
        return []
    
    # Group opening positions by ECO code
    eco_fens: Dict[str, List[str]] = {}
    
    for move in moves:
        ply = move.get("ply", 0)
        eco = move.get("eco", "")
        fen = move.get("fen_before")
        
        # Focus on opening phase (ply 6-20)
        if 6 <= ply <= 20 and eco and fen:
            if eco not in eco_fens:
                eco_fens[eco] = []
            if fen not in eco_fens[eco]:
                eco_fens[eco].append(fen)
    
    # Sample 1-2 positions per ECO
    fens = []
    positions_per_eco = max(1, min(2, budget // max(1, len(eco_fens))))
    
    for eco, eco_positions in eco_fens.items():
        if len(fens) >= budget:
            break
        
        # Take first N positions (they're roughly in ply order)
        for fen in eco_positions[:positions_per_eco]:
            if fen not in fens:
                fens.append(fen)
                if len(fens) >= budget:
                    break
    
    return fens


def compute_sampling_stats(sampled: SampledPositions) -> Dict[str, Any]:
    """
    Compute statistics about sampled positions for debugging.
    """
    return {
        "puzzle_count": len(sampled.puzzle_fens),
        "weak_line_count": len(sampled.weak_line_fens),
        "opening_count": len(sampled.opening_fens),
        "turning_point_count": len(sampled.turning_point_fens),
        "total_unique": sampled.total_count,
        "overlap_count": (
            len(sampled.puzzle_fens) + len(sampled.weak_line_fens) +
            len(sampled.opening_fens) + len(sampled.turning_point_fens) -
            sampled.total_count
        ),
    }
