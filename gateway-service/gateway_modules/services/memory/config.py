"""
Persistent Trainer Configuration.

Feature flag and configuration for time-aware trend detection and event-based coaching.
"""

import os

# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Main feature flag - when False, entire persistent trainer module is disabled
ENABLE_PERSISTENT_TRAINER = os.environ.get("ENABLE_PERSISTENT_TRAINER", "0") == "1"

# =============================================================================
# SAMPLE SIZE THRESHOLDS
# =============================================================================

# Minimum games required for event detection
MIN_SAMPLE_SIZE_FOR_EVENTS = 10

# Minimum games per snapshot period
MIN_GAMES_PER_PERIOD = 5

# =============================================================================
# EVENT DETECTION THRESHOLDS
# =============================================================================

# Improvement thresholds
IMPROVEMENT_WINRATE_THRESHOLD = 0.05       # +5% winrate = improvement
IMPROVEMENT_BLUNDER_THRESHOLD = -0.3       # -0.3 blunders/game = improvement
IMPROVEMENT_OPENING_THRESHOLD = 0.10       # +10% opening score = improvement

# Regression thresholds
REGRESSION_BLUNDER_THRESHOLD = 0.3         # +0.3 blunders/game = regression
REGRESSION_ENDGAME_THRESHOLD = -0.08       # -8% endgame accuracy = regression

# Stagnation thresholds
STAGNATION_DELTA_THRESHOLD = 0.02          # All deltas < ±2% = stagnation
STAGNATION_CONSECUTIVE_SNAPSHOTS = 2       # N snapshots with flat deltas

# False confidence thresholds
FALSE_CONFIDENCE_RESULT_THRESHOLD = 0.05   # Results improving
FALSE_CONFIDENCE_CONCEPT_THRESHOLD = -0.02 # But concepts flat or declining

# Consistency thresholds
CONSISTENCY_VARIANCE_THRESHOLD = -0.1      # Variance decreasing = more consistent

# =============================================================================
# CONFIDENCE SCORING
# =============================================================================

# Minimum confidence to display an event to user
MIN_EVENT_CONFIDENCE = 0.5

# Confidence modifiers based on sample size
CONFIDENCE_BASE = 0.6
CONFIDENCE_PER_10_GAMES = 0.1  # +0.1 per 10 games above minimum
CONFIDENCE_MAX = 0.95

# =============================================================================
# CACHE SETTINGS
# =============================================================================

# Number of snapshots to keep in history for delta computation
SNAPSHOT_HISTORY_LIMIT = 5

# Number of granular games to keep before aggregating
GRANULAR_GAME_LIMIT = 30

# =============================================================================
# LLM VERBALIZATION SETTINGS
# =============================================================================

# Maximum events to verbalize in a single summary
MAX_EVENTS_TO_VERBALIZE = 3

# Token budget for event summary (to limit LLM usage)
EVENT_SUMMARY_MAX_TOKENS = 150
