"""
Non-LLM Commentary Module Configuration.

Feature flag and configuration for deterministic, YAML-driven chess commentary.
"""

import os

# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Main feature flag - when False, entire module is disabled
ENABLE_NON_LLM_COMMENTARY = os.environ.get("ENABLE_NON_LLM_COMMENTARY", "1") == "1"

# =============================================================================
# CONFIGURATION
# =============================================================================

# Verbosity levels:
# 0 - Silent / Expert (no commentary)
# 1 - Tactics only (forced mates, forks, pins)
# 2 - Standard (Chess.com-like, default)
# 3 - Teaching (positional ideas, pawn structure)
# 4 - Guided coach (everything)
VERBOSITY_LEVEL = int(os.environ.get("NON_LLM_VERBOSITY", "2"))

# Minimum confidence threshold for commentary output
CONFIDENCE_THRESHOLD = float(os.environ.get("NON_LLM_CONFIDENCE_THRESHOLD", "0.7"))

# Repetition cooldown: number of moves before same idea can be repeated
REPETITION_COOLDOWN_MOVES = int(os.environ.get("NON_LLM_REPETITION_COOLDOWN", "5"))

# =============================================================================
# PRIORITY TIERS (higher = more important)
# =============================================================================

PRIORITY_TIERS = {
    "forced_outcome": 100,    # Mate, forced material win
    "tactical_motif": 80,     # Fork, skewer, pin, discovered attack
    "positional_idea": 60,    # Activate piece, open file, outpost
    "pawn_structure": 40,     # Passed pawn, isolated pawn, weak squares
    "filler": 20,             # General observations
}

# =============================================================================
# MOVE QUALITY LABELS (Chess.com style)
# =============================================================================

MOVE_QUALITY_LABELS = {
    "brilliant": {"min_cp_gain": 200, "has_sacrifice": True},
    "great": {"min_cp_gain": 150, "has_sacrifice": False},
    "best": {"is_engine_top_choice": True},
    "excellent": {"cp_loss": 0, "cp_loss_max": 10},
    "good": {"cp_loss_max": 30},
    "book": {"is_theory": True},
    "inaccuracy": {"cp_loss_min": 50, "cp_loss_max": 99},
    "mistake": {"cp_loss_min": 100, "cp_loss_max": 199},
    "blunder": {"cp_loss_min": 200},
    "miss": {"missed_tactic": True},
}
