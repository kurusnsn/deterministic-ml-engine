"""
Verbosity Controller for Rich Stockfish Commentary.

Controls how verbose commentary should be based on detected motifs
and engine analysis. Prevents spam while matching Chess.com's behavior.

Feature-flagged behind ENABLE_RICH_STOCKFISH_COMMENTARY.
"""

import os
from enum import IntEnum
from typing import Dict, Any, Optional

from .motif_detection import DetectedMotifs, ENABLE_RICH_STOCKFISH_COMMENTARY


class VerbosityLevel(IntEnum):
    """
    Verbosity levels for commentary output.
    
    LOW:    Short factual sentence (default)
    MEDIUM: Explanation + consequence
    HIGH:   Explanation + consequence + UI action
    """
    LOW = 1
    MEDIUM = 2
    HIGH = 3


# Thresholds for verbosity escalation
MISTAKE_THRESHOLD_CP = 100  # Centipawn loss to qualify as mistake
BLUNDER_THRESHOLD_CP = 300  # Centipawn loss to qualify as blunder


def determine_verbosity(
    motifs: Optional[DetectedMotifs] = None,
    engine_data: Optional[Dict[str, Any]] = None,
    eval_delta_cp: Optional[float] = None,
    move_classification: Optional[str] = None,
) -> VerbosityLevel:
    """
    Determine appropriate verbosity level for commentary.
    
    Escalation rules:
    1. Default: LOW
    2. Any tactical motif → MEDIUM
    3. Forced line (only move) → MEDIUM
    4. Eval delta >= mistake threshold → MEDIUM
    5. Mate in PV → HIGH
    6. Promotion involved → HIGH
    7. Blunder classification → HIGH
    
    Args:
        motifs: Detected motifs from motif_detection
        engine_data: Stockfish analysis (cp, mate, pv)
        eval_delta_cp: Evaluation change in centipawns
        move_classification: Move quality label (best, good, inaccuracy, mistake, blunder)
        
    Returns:
        VerbosityLevel enum value
    """
    if not ENABLE_RICH_STOCKFISH_COMMENTARY:
        return VerbosityLevel.LOW
    
    motifs = motifs or DetectedMotifs()
    engine_data = engine_data or {}
    
    # Start with LOW
    level = VerbosityLevel.LOW
    
    # --- Escalation to MEDIUM ---
    
    # Any tactical motif
    if motifs.any_tactical():
        level = max(level, VerbosityLevel.MEDIUM)
    
    # Only move / forced line
    if motifs.only_move:
        level = max(level, VerbosityLevel.MEDIUM)
    
    # Significant eval change
    if eval_delta_cp is not None and abs(eval_delta_cp) >= MISTAKE_THRESHOLD_CP:
        level = max(level, VerbosityLevel.MEDIUM)
    
    # Move classified as inaccuracy or worse
    if move_classification in ["inaccuracy", "mistake"]:
        level = max(level, VerbosityLevel.MEDIUM)
    
    # Passed pawn
    if motifs.passed_pawn:
        level = max(level, VerbosityLevel.MEDIUM)
    
    # --- Escalation to HIGH ---
    
    # Mate in PV
    if engine_data.get("mate") is not None:
        level = VerbosityLevel.HIGH
    
    # Promotion threat
    if motifs.promotion_threat:
        level = VerbosityLevel.HIGH
    
    # Blunder classification
    if move_classification == "blunder":
        level = VerbosityLevel.HIGH
    
    # Large eval swing (blunder-level)
    if eval_delta_cp is not None and abs(eval_delta_cp) >= BLUNDER_THRESHOLD_CP:
        level = VerbosityLevel.HIGH
    
    return level


def get_verbosity_reason(
    level: VerbosityLevel,
    motifs: Optional[DetectedMotifs] = None,
    engine_data: Optional[Dict[str, Any]] = None,
    eval_delta_cp: Optional[float] = None,
    move_classification: Optional[str] = None,
) -> str:
    """
    Get a human-readable reason for the verbosity level.
    
    Useful for debugging and testing.
    """
    if not ENABLE_RICH_STOCKFISH_COMMENTARY:
        return "feature disabled"
    
    if level == VerbosityLevel.HIGH:
        if engine_data and engine_data.get("mate") is not None:
            return "mate in position"
        if motifs and motifs.promotion_threat:
            return "promotion threat"
        if move_classification == "blunder":
            return "blunder"
        if eval_delta_cp and abs(eval_delta_cp) >= BLUNDER_THRESHOLD_CP:
            return "large eval swing"
        return "high priority motif"
    
    if level == VerbosityLevel.MEDIUM:
        if motifs:
            if motifs.fork:
                return "fork detected"
            if motifs.pin:
                return "pin detected"
            if motifs.skewer:
                return "skewer detected"
            if motifs.hanging_piece:
                return "hanging piece"
            if motifs.only_move:
                return "only move"
            if motifs.passed_pawn:
                return "passed pawn"
        if move_classification in ["inaccuracy", "mistake"]:
            return f"{move_classification}"
        if eval_delta_cp and abs(eval_delta_cp) >= MISTAKE_THRESHOLD_CP:
            return "eval loss"
        return "tactical pattern"
    
    return "default"


def should_include_action(
    level: VerbosityLevel,
    has_pv: bool = False,
) -> bool:
    """
    Determine if UI actions should be attached to commentary.
    
    Actions are only included at HIGH verbosity or when
    there's a clear PV to show.
    """
    if not ENABLE_RICH_STOCKFISH_COMMENTARY:
        return False
    
    if level == VerbosityLevel.HIGH:
        return True
    
    if level == VerbosityLevel.MEDIUM and has_pv:
        return True
    
    return False


def get_sentence_count(level: VerbosityLevel) -> int:
    """
    Get target sentence count for verbosity level.
    
    LOW:    1 sentence
    MEDIUM: 2 sentences
    HIGH:   3 sentences
    """
    return int(level)
