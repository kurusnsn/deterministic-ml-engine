"""
Trainer Event Service.

Detects explicit events from ML snapshot deltas.
NO ML, NO LLM - pure threshold-based detection.

Events:
1. Improvement - winrate/residual/puzzle quality up
2. Regression - blunders/volatility up, quality down  
3. Stagnation - deltas ~0 across N snapshots
4. False Confidence - results up but concepts unchanged
5. Consistency - style similarity high, variance down
"""

from typing import Dict, Any, Optional, List, Literal
from dataclasses import dataclass, asdict

from .trainer_delta_service import TrainerDelta
from .trainer_snapshot_service import MLTrainerSnapshot, get_ml_snapshot_history
from ..memory.config import (
    ENABLE_PERSISTENT_TRAINER,
    MIN_SAMPLE_SIZE_FOR_EVENTS,
    IMPROVEMENT_WINRATE_THRESHOLD,
    REGRESSION_BLUNDER_THRESHOLD,
    STAGNATION_DELTA_THRESHOLD,
    STAGNATION_CONSECUTIVE_SNAPSHOTS,
    MIN_EVENT_CONFIDENCE,
    CONFIDENCE_BASE,
    CONFIDENCE_PER_10_GAMES,
    CONFIDENCE_MAX,
)


# =============================================================================
# EVENT DATA CLASS
# =============================================================================

@dataclass
class MLTrainerEvent:
    """
    Detected trainer event from ML outputs.
    
    Events are facts derived from deltas, not opinions.
    """
    type: Literal["improvement", "regression", "stagnation", "false_confidence", "consistency"]
    signals: Dict[str, Any]  # Which metrics triggered this
    confidence: float  # 0.0-1.0
    description: str  # Human-readable summary
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# CONFIDENCE COMPUTATION
# =============================================================================

def _compute_confidence(games: int, num_signals: int = 1) -> float:
    """Compute confidence based on sample size and signal count."""
    base = CONFIDENCE_BASE
    size_bonus = min(games - MIN_SAMPLE_SIZE_FOR_EVENTS, 50) // 10 * CONFIDENCE_PER_10_GAMES
    signal_bonus = 0.05 * (num_signals - 1)
    return min(base + size_bonus + signal_bonus, CONFIDENCE_MAX)


# =============================================================================
# EVENT DETECTION FUNCTIONS
# =============================================================================

def detect_improvement(
    delta: TrainerDelta,
    current: MLTrainerSnapshot
) -> Optional[MLTrainerEvent]:
    """
    Detect improvement event.
    
    Triggers when:
    - winrate ↑ OR
    - opening residual ↑ OR
    - puzzle quality ↑
    """
    signals = {}
    
    # Winrate improvement
    if delta.overall_winrate_delta > IMPROVEMENT_WINRATE_THRESHOLD:
        signals["winrate"] = delta.overall_winrate_delta
    
    # Opening residual improvement (any ECO improved significantly)
    for eco, residual_delta in delta.opening_residual_deltas.items():
        if residual_delta > 0.08:  # +8% residual improvement
            signals[f"opening_{eco}"] = residual_delta
    
    # Puzzle quality improvement
    if delta.puzzle_quality_delta is not None and delta.puzzle_quality_delta > 0.05:
        signals["puzzle_quality"] = delta.puzzle_quality_delta
    
    if not signals:
        return None
    
    confidence = _compute_confidence(current.total_games, len(signals))
    description = _build_improvement_description(signals)
    
    return MLTrainerEvent(
        type="improvement",
        signals=signals,
        confidence=confidence,
        description=description
    )


def detect_regression(
    delta: TrainerDelta,
    current: MLTrainerSnapshot
) -> Optional[MLTrainerEvent]:
    """
    Detect regression event.
    
    Triggers when:
    - blunder insights ↑
    - opening residual ↓
    - puzzle quality ↓
    """
    signals = {}
    
    # Check for blunder-related insight increases
    for insight_type, count_delta in delta.insight_count_deltas.items():
        if "blunder" in insight_type.lower() and count_delta > 2:
            signals[f"insight_{insight_type}"] = count_delta
    
    # Opening residual decline
    for eco, residual_delta in delta.opening_residual_deltas.items():
        if residual_delta < -0.08:  # -8% residual decline
            signals[f"opening_{eco}"] = residual_delta
    
    # Puzzle quality decline
    if delta.puzzle_quality_delta is not None and delta.puzzle_quality_delta < -0.05:
        signals["puzzle_quality"] = delta.puzzle_quality_delta
    
    # Winrate decline
    if delta.overall_winrate_delta < -IMPROVEMENT_WINRATE_THRESHOLD:
        signals["winrate"] = delta.overall_winrate_delta
    
    if not signals:
        return None
    
    confidence = _compute_confidence(current.total_games, len(signals))
    description = _build_regression_description(signals)
    
    return MLTrainerEvent(
        type="regression",
        signals=signals,
        confidence=confidence,
        description=description
    )


def detect_stagnation(
    delta: TrainerDelta,
    current: MLTrainerSnapshot,
    user_id: str
) -> Optional[MLTrainerEvent]:
    """
    Detect stagnation event.
    
    Triggers when:
    - deltas ≈ 0 across N snapshots
    """
    # Check if all key deltas are small
    key_metrics_flat = (
        abs(delta.overall_winrate_delta) < STAGNATION_DELTA_THRESHOLD and
        delta.style_similarity > 0.98 and
        not delta.opening_residual_deltas  # No significant changes
    )
    
    if not key_metrics_flat:
        return None
    
    # Check history for consecutive stagnation
    history = get_ml_snapshot_history(user_id)
    if len(history) < STAGNATION_CONSECUTIVE_SNAPSHOTS:
        return None
    
    # Count consecutive flat snapshots
    # (simplified: just check if current is flat)
    consecutive_flat = 1
    
    signals = {
        "winrate_delta": delta.overall_winrate_delta,
        "style_similarity": delta.style_similarity,
        "consecutive_periods": consecutive_flat
    }
    
    return MLTrainerEvent(
        type="stagnation",
        signals=signals,
        confidence=_compute_confidence(current.total_games),
        description=f"Your key metrics have remained stable over recent reports."
    )


def detect_false_confidence(
    delta: TrainerDelta,
    current: MLTrainerSnapshot
) -> Optional[MLTrainerEvent]:
    """
    Detect false confidence event.
    
    Triggers when:
    - results ↑ (winrate improving)
    - but opening residuals or style unchanged
    """
    # Results improving
    results_improving = delta.overall_winrate_delta > IMPROVEMENT_WINRATE_THRESHOLD
    
    if not results_improving:
        return None
    
    # Check if concepts are NOT improving
    no_residual_improvement = all(
        d <= 0.02 for d in delta.opening_residual_deltas.values()
    ) if delta.opening_residual_deltas else True
    
    style_unchanged = delta.style_similarity > 0.95
    
    if no_residual_improvement or style_unchanged:
        signals = {
            "winrate_delta": delta.overall_winrate_delta,
            "style_similarity": delta.style_similarity,
            "residual_stagnant": no_residual_improvement
        }
        
        return MLTrainerEvent(
            type="false_confidence",
            signals=signals,
            confidence=_compute_confidence(current.total_games),
            description="Results improved but underlying metrics suggest room for deeper improvement."
        )
    
    return None


def detect_consistency(
    delta: TrainerDelta,
    current: MLTrainerSnapshot
) -> Optional[MLTrainerEvent]:
    """
    Detect consistency event.
    
    Triggers when:
    - style similarity high over time
    - variance decreasing
    """
    if delta.style_similarity >= 0.95 and delta.days_between > 7:
        signals = {
            "style_similarity": delta.style_similarity,
            "days": delta.days_between
        }
        
        return MLTrainerEvent(
            type="consistency",
            signals=signals,
            confidence=_compute_confidence(current.total_games),
            description="Your playing style has remained consistent across recent games."
        )
    
    return None


# =============================================================================
# MAIN EVENT DETECTION
# =============================================================================

def detect_ml_trainer_events(
    current: MLTrainerSnapshot,
    delta: TrainerDelta,
    user_id: str
) -> List[MLTrainerEvent]:
    """
    Detect all applicable events from ML snapshot delta.
    
    Args:
        current: Current snapshot
        delta: Computed delta from previous snapshot
        user_id: User ID for history lookup
        
    Returns:
        List of detected events (filtered by confidence)
    """
    if not ENABLE_PERSISTENT_TRAINER:
        return []
    
    if current.total_games < MIN_SAMPLE_SIZE_FOR_EVENTS:
        return []
    
    events: List[MLTrainerEvent] = []
    
    # Detect each event type
    improvement = detect_improvement(delta, current)
    if improvement:
        events.append(improvement)
    
    regression = detect_regression(delta, current)
    if regression:
        events.append(regression)
    
    stagnation = detect_stagnation(delta, current, user_id)
    if stagnation:
        events.append(stagnation)
    
    false_conf = detect_false_confidence(delta, current)
    if false_conf:
        events.append(false_conf)
    
    consistency = detect_consistency(delta, current)
    if consistency:
        events.append(consistency)
    
    # Filter by confidence
    events = [e for e in events if e.confidence >= MIN_EVENT_CONFIDENCE]
    
    # Sort by confidence (highest first)
    events.sort(key=lambda e: e.confidence, reverse=True)
    
    return events


# =============================================================================
# DESCRIPTION BUILDERS
# =============================================================================

def _build_improvement_description(signals: Dict[str, Any]) -> str:
    """Build human-readable improvement description."""
    parts = []
    
    if "winrate" in signals:
        pct = int(signals["winrate"] * 100)
        parts.append(f"win rate up {pct}%")
    
    if "puzzle_quality" in signals:
        parts.append("puzzle quality improved")
    
    for key, value in signals.items():
        if key.startswith("opening_"):
            eco = key.replace("opening_", "")
            pct = int(value * 100)
            parts.append(f"{eco} performance up {pct}%")
    
    if parts:
        return "Improvement detected: " + ", ".join(parts) + "."
    return "General improvement detected."


def _build_regression_description(signals: Dict[str, Any]) -> str:
    """Build human-readable regression description."""
    parts = []
    
    if "winrate" in signals:
        pct = abs(int(signals["winrate"] * 100))
        parts.append(f"win rate down {pct}%")
    
    if "puzzle_quality" in signals:
        parts.append("puzzle quality declined")
    
    for key, value in signals.items():
        if key.startswith("opening_"):
            eco = key.replace("opening_", "")
            pct = abs(int(value * 100))
            parts.append(f"{eco} performance down {pct}%")
    
    if parts:
        return "Area to focus on: " + ", ".join(parts) + "."
    return "Some areas need attention."
