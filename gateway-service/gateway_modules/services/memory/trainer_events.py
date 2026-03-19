"""
Trainer Events Module for Persistent Trainer feature.

Handles:
- Derived metrics computation from raw stats
- Snapshot delta computation (current vs previous)
- Event detection (improvement, regression, stagnation, false_confidence, consistency)
- In-memory snapshot caching
- LLM verbalization of detected events
"""

import os
import json
import httpx
from typing import Dict, Any, Optional, List, Literal
from dataclasses import dataclass, field, asdict
from datetime import datetime
from collections import defaultdict

from .config import (
    ENABLE_PERSISTENT_TRAINER,
    MIN_SAMPLE_SIZE_FOR_EVENTS,
    IMPROVEMENT_WINRATE_THRESHOLD,
    IMPROVEMENT_BLUNDER_THRESHOLD,
    IMPROVEMENT_OPENING_THRESHOLD,
    REGRESSION_BLUNDER_THRESHOLD,
    REGRESSION_ENDGAME_THRESHOLD,
    STAGNATION_DELTA_THRESHOLD,
    STAGNATION_CONSECUTIVE_SNAPSHOTS,
    FALSE_CONFIDENCE_RESULT_THRESHOLD,
    FALSE_CONFIDENCE_CONCEPT_THRESHOLD,
    CONSISTENCY_VARIANCE_THRESHOLD,
    CONFIDENCE_BASE,
    CONFIDENCE_PER_10_GAMES,
    CONFIDENCE_MAX,
    MIN_EVENT_CONFIDENCE,
    SNAPSHOT_HISTORY_LIMIT,
    MAX_EVENTS_TO_VERBALIZE,
    EVENT_SUMMARY_MAX_TOKENS,
)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class DerivedMetrics:
    """Metrics derived from raw stats for trend comparison."""
    winrate: float = 0.5
    blunders_per_game: float = 0.0
    opening_scores: Dict[str, float] = field(default_factory=dict)  # ECO -> score
    endgame_accuracy: Optional[float] = None
    variance: float = 0.0  # For consistency detection
    sample_size: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass  
class TrainerEvent:
    """A detected trainer event (improvement, regression, etc.)."""
    type: Literal["improvement", "regression", "stagnation", "false_confidence", "consistency"]
    signal: Dict[str, Any]  # Which metrics triggered this
    confidence: float  # 0.0-1.0
    description: str  # Human-readable summary
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TrainerSnapshot:
    """Complete trainer snapshot with derived data and events."""
    snapshot_id: str
    period: Literal["last_20_games", "last_50_games"]
    raw_stats: Dict[str, Any]  # Existing from memory_snapshot_service
    derived_metrics: DerivedMetrics  # Computed
    derived_deltas: Dict[str, float]  # vs previous snapshot
    events: List[TrainerEvent]  # Detected events
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        d["derived_metrics"] = self.derived_metrics.to_dict()
        d["events"] = [e.to_dict() for e in self.events]
        return d


# =============================================================================
# IN-MEMORY CACHE (No DB changes)
# =============================================================================

# user_id -> list of TrainerSnapshots (most recent last)
_snapshot_history_cache: Dict[str, List[TrainerSnapshot]] = defaultdict(list)


def get_previous_snapshot_metrics(
    user_id: str,
    time_control: str,
    side: str
) -> Optional[DerivedMetrics]:
    """Get derived metrics from the previous snapshot (if any)."""
    cache_key = f"{user_id}:{time_control}:{side}"
    history = _snapshot_history_cache.get(cache_key, [])
    if len(history) >= 1:
        return history[-1].derived_metrics
    return None


def get_snapshot_history(
    user_id: str,
    time_control: str,
    side: str
) -> List[TrainerSnapshot]:
    """Get full snapshot history for a user."""
    cache_key = f"{user_id}:{time_control}:{side}"
    return _snapshot_history_cache.get(cache_key, [])


def store_snapshot(
    user_id: str,
    time_control: str,
    side: str,
    snapshot: TrainerSnapshot
) -> None:
    """Store a snapshot in the history cache."""
    cache_key = f"{user_id}:{time_control}:{side}"
    history = _snapshot_history_cache[cache_key]
    history.append(snapshot)
    # Prune to history limit
    if len(history) > SNAPSHOT_HISTORY_LIMIT:
        _snapshot_history_cache[cache_key] = history[-SNAPSHOT_HISTORY_LIMIT:]


def get_cached_trainer_snapshot(
    user_id: str,
    time_control: str,
    side: str
) -> Optional[TrainerSnapshot]:
    """Get the most recent cached trainer snapshot."""
    cache_key = f"{user_id}:{time_control}:{side}"
    history = _snapshot_history_cache.get(cache_key, [])
    return history[-1] if history else None


# =============================================================================
# DERIVED METRICS COMPUTATION
# =============================================================================

def compute_derived_metrics(raw_stats: Dict[str, Any]) -> DerivedMetrics:
    """
    Compute derived metrics from raw stats.
    
    Args:
        raw_stats: Raw stats from memory_snapshot_service.compute_raw_stats_for_user
        
    Returns:
        DerivedMetrics object with computed values
    """
    sample_size = raw_stats.get("sample_size", 0)
    wins = raw_stats.get("wins", 0)
    losses = raw_stats.get("losses", 0)
    draws = raw_stats.get("draws", 0)
    
    # Winrate
    total_games = wins + losses + draws
    winrate = (wins + 0.5 * draws) / total_games if total_games > 0 else 0.5
    
    # Blunders per game
    blunders_per_game = raw_stats.get("blunders_per_game", 0.0)
    
    # Opening scores (from top_openings)
    opening_scores = {}
    for opening in raw_stats.get("top_openings", []):
        eco = opening.get("eco", "")
        score = opening.get("score", 0.5)
        if eco:
            opening_scores[eco] = score
    
    # Endgame accuracy (derived from blunder distribution)
    blunder_dist = raw_stats.get("blunder_distribution", {})
    endgame_blunders = blunder_dist.get("endgame", 0)
    middlegame_blunders = blunder_dist.get("middlegame", 0)
    opening_blunders = blunder_dist.get("opening", 0)
    total_blunders = endgame_blunders + middlegame_blunders + opening_blunders
    
    # Endgame accuracy: inverse of endgame blunder proportion
    if total_blunders > 0 and sample_size > 0:
        endgame_blunder_rate = endgame_blunders / sample_size
        endgame_accuracy = max(0.0, 1.0 - (endgame_blunder_rate * 2))  # Scale to 0-1
    else:
        endgame_accuracy = None
    
    # Variance (standard deviation proxy from phase distribution)
    if total_blunders > 0:
        phase_proportions = [
            opening_blunders / max(1, total_blunders),
            middlegame_blunders / max(1, total_blunders),
            endgame_blunders / max(1, total_blunders)
        ]
        mean_proportion = sum(phase_proportions) / 3
        variance = sum((p - mean_proportion) ** 2 for p in phase_proportions) / 3
    else:
        variance = 0.0
    
    return DerivedMetrics(
        winrate=round(winrate, 4),
        blunders_per_game=round(blunders_per_game, 2),
        opening_scores=opening_scores,
        endgame_accuracy=round(endgame_accuracy, 4) if endgame_accuracy is not None else None,
        variance=round(variance, 4),
        sample_size=sample_size
    )


# =============================================================================
# SNAPSHOT DELTA COMPUTATION
# =============================================================================

def compute_snapshot_deltas(
    current: DerivedMetrics,
    previous: Optional[DerivedMetrics]
) -> Dict[str, float]:
    """
    Compute deltas between current and previous snapshot metrics.
    
    Args:
        current: Current derived metrics
        previous: Previous derived metrics (or None for first snapshot)
        
    Returns:
        Dictionary of deltas (metric_name -> delta value)
    """
    if previous is None:
        return {}  # No deltas for first snapshot
    
    deltas = {}
    
    # Winrate delta
    deltas["winrate_delta"] = round(current.winrate - previous.winrate, 4)
    
    # Blunders per game delta (negative = improvement)
    deltas["blunders_per_game_delta"] = round(
        current.blunders_per_game - previous.blunders_per_game, 2
    )
    
    # Endgame accuracy delta
    if current.endgame_accuracy is not None and previous.endgame_accuracy is not None:
        deltas["endgame_accuracy_delta"] = round(
            current.endgame_accuracy - previous.endgame_accuracy, 4
        )
    
    # Variance delta (negative = more consistent)
    deltas["variance_delta"] = round(current.variance - previous.variance, 4)
    
    # Opening score deltas (for common openings)
    common_ecos = set(current.opening_scores.keys()) & set(previous.opening_scores.keys())
    for eco in common_ecos:
        delta = current.opening_scores[eco] - previous.opening_scores[eco]
        if abs(delta) >= 0.01:  # Only include meaningful deltas
            deltas[f"opening_{eco}_delta"] = round(delta, 4)
    
    return deltas


# =============================================================================
# EVENT DETECTION (Deterministic, No LLM)
# =============================================================================

def _compute_confidence(sample_size: int, num_triggers: int = 1) -> float:
    """Compute confidence score based on sample size and trigger count."""
    base = CONFIDENCE_BASE
    size_bonus = min(sample_size - MIN_SAMPLE_SIZE_FOR_EVENTS, 50) // 10 * CONFIDENCE_PER_10_GAMES
    trigger_bonus = 0.05 * (num_triggers - 1)  # More triggers = more confident
    return min(base + size_bonus + trigger_bonus, CONFIDENCE_MAX)


def detect_improvement_event(
    deltas: Dict[str, float],
    sample_size: int
) -> Optional[TrainerEvent]:
    """
    Detect improvement event.
    
    Triggers when:
    - winrate_delta > +0.05 OR
    - blunders_per_game_delta < -0.3 OR
    - any opening score delta > +0.1
    """
    signals = {}
    
    if deltas.get("winrate_delta", 0) > IMPROVEMENT_WINRATE_THRESHOLD:
        signals["winrate"] = deltas["winrate_delta"]
    
    if deltas.get("blunders_per_game_delta", 0) < IMPROVEMENT_BLUNDER_THRESHOLD:
        signals["blunders"] = deltas["blunders_per_game_delta"]
    
    # Check opening improvements
    for key, value in deltas.items():
        if key.startswith("opening_") and key.endswith("_delta"):
            if value > IMPROVEMENT_OPENING_THRESHOLD:
                signals[key.replace("_delta", "")] = value
    
    if signals:
        confidence = _compute_confidence(sample_size, len(signals))
        description = _build_improvement_description(signals)
        return TrainerEvent(
            type="improvement",
            signal=signals,
            confidence=confidence,
            description=description
        )
    return None


def detect_regression_event(
    deltas: Dict[str, float],
    sample_size: int
) -> Optional[TrainerEvent]:
    """
    Detect regression event.
    
    Triggers when:
    - blunders_per_game_delta > +0.3 OR
    - endgame_accuracy_delta < -0.08
    """
    signals = {}
    
    if deltas.get("blunders_per_game_delta", 0) > REGRESSION_BLUNDER_THRESHOLD:
        signals["blunders"] = deltas["blunders_per_game_delta"]
    
    if deltas.get("endgame_accuracy_delta", 0) < REGRESSION_ENDGAME_THRESHOLD:
        signals["endgame_accuracy"] = deltas["endgame_accuracy_delta"]
    
    if signals:
        confidence = _compute_confidence(sample_size, len(signals))
        description = _build_regression_description(signals)
        return TrainerEvent(
            type="regression",
            signal=signals,
            confidence=confidence,
            description=description
        )
    return None


def detect_stagnation_event(
    deltas: Dict[str, float],
    sample_size: int,
    user_id: str,
    time_control: str,
    side: str
) -> Optional[TrainerEvent]:
    """
    Detect stagnation event.
    
    Triggers when:
    - All key deltas are within ±STAGNATION_DELTA_THRESHOLD
    - This pattern persists for STAGNATION_CONSECUTIVE_SNAPSHOTS snapshots
    """
    if not deltas:
        return None
    
    # Check if all key deltas are small
    key_deltas = ["winrate_delta", "blunders_per_game_delta", "endgame_accuracy_delta"]
    all_flat = True
    for key in key_deltas:
        if key in deltas and abs(deltas[key]) > STAGNATION_DELTA_THRESHOLD:
            all_flat = False
            break
    
    if not all_flat:
        return None
    
    # Check history for consecutive stagnation
    history = get_snapshot_history(user_id, time_control, side)
    consecutive_flat = 1  # Current counts as 1
    for snapshot in reversed(history):
        snapshot_flat = True
        for key in key_deltas:
            if key in snapshot.derived_deltas and abs(snapshot.derived_deltas[key]) > STAGNATION_DELTA_THRESHOLD:
                snapshot_flat = False
                break
        if snapshot_flat:
            consecutive_flat += 1
        else:
            break
    
    if consecutive_flat >= STAGNATION_CONSECUTIVE_SNAPSHOTS:
        signals = {k: deltas.get(k, 0) for k in key_deltas if k in deltas}
        signals["consecutive_periods"] = consecutive_flat
        
        return TrainerEvent(
            type="stagnation",
            signal=signals,
            confidence=_compute_confidence(sample_size),
            description=f"Your key metrics have remained stable over {consecutive_flat} analysis periods."
        )
    return None


def detect_false_confidence_event(
    deltas: Dict[str, float],
    sample_size: int
) -> Optional[TrainerEvent]:
    """
    Detect false confidence event.
    
    Triggers when:
    - winrate_delta > +0.05 (results improving) AND
    - blunders_per_game_delta >= 0 OR any concept metric flat/declining
    """
    winrate_improving = deltas.get("winrate_delta", 0) > FALSE_CONFIDENCE_RESULT_THRESHOLD
    
    if not winrate_improving:
        return None
    
    # Check if concepts are not improving
    blunders_not_improving = deltas.get("blunders_per_game_delta", 0) >= FALSE_CONFIDENCE_CONCEPT_THRESHOLD
    endgame_declining = deltas.get("endgame_accuracy_delta", 0) < FALSE_CONFIDENCE_CONCEPT_THRESHOLD
    
    if blunders_not_improving or endgame_declining:
        signals = {
            "winrate_delta": deltas.get("winrate_delta"),
            "blunders_per_game_delta": deltas.get("blunders_per_game_delta", 0),
        }
        if endgame_declining:
            signals["endgame_accuracy_delta"] = deltas.get("endgame_accuracy_delta")
        
        return TrainerEvent(
            type="false_confidence",
            signal=signals,
            confidence=_compute_confidence(sample_size),
            description="Your results have improved, but underlying metrics suggest opportunity for deeper improvement."
        )
    return None


def detect_consistency_event(
    deltas: Dict[str, float],
    sample_size: int
) -> Optional[TrainerEvent]:
    """
    Detect consistency event.
    
    Triggers when:
    - variance_delta < -0.1 (decreasing variance = more consistent)
    """
    if deltas.get("variance_delta", 0) < CONSISTENCY_VARIANCE_THRESHOLD:
        signals = {"variance_delta": deltas["variance_delta"]}
        
        return TrainerEvent(
            type="consistency",
            signal=signals,
            confidence=_compute_confidence(sample_size),
            description="Your play has become more consistent with less variation across game phases."
        )
    return None


def detect_trainer_events(
    deltas: Dict[str, float],
    sample_size: int,
    user_id: str = "",
    time_control: str = "all",
    side: str = "both"
) -> List[TrainerEvent]:
    """
    Detect all applicable trainer events from snapshot deltas.
    
    Args:
        deltas: Computed deltas between current and previous snapshot
        sample_size: Number of games in current sample
        user_id: User ID for history lookup (stagnation detection)
        time_control: Time control filter
        side: Side filter
        
    Returns:
        List of detected TrainerEvent objects (filtered by confidence threshold)
    """
    if not ENABLE_PERSISTENT_TRAINER:
        return []
    
    if sample_size < MIN_SAMPLE_SIZE_FOR_EVENTS:
        return []
    
    if not deltas:
        return []  # No previous snapshot to compare
    
    events: List[TrainerEvent] = []
    
    # Detect each event type
    improvement = detect_improvement_event(deltas, sample_size)
    if improvement:
        events.append(improvement)
    
    regression = detect_regression_event(deltas, sample_size)
    if regression:
        events.append(regression)
    
    stagnation = detect_stagnation_event(deltas, sample_size, user_id, time_control, side)
    if stagnation:
        events.append(stagnation)
    
    false_confidence = detect_false_confidence_event(deltas, sample_size)
    if false_confidence:
        events.append(false_confidence)
    
    consistency = detect_consistency_event(deltas, sample_size)
    if consistency:
        events.append(consistency)
    
    # Filter by confidence threshold
    events = [e for e in events if e.confidence >= MIN_EVENT_CONFIDENCE]
    
    # Sort by confidence (highest first)
    events.sort(key=lambda e: e.confidence, reverse=True)
    
    return events


# =============================================================================
# DESCRIPTION BUILDERS (Deterministic)
# =============================================================================

def _build_improvement_description(signals: Dict[str, Any]) -> str:
    """Build human-readable improvement description."""
    parts = []
    
    if "winrate" in signals:
        pct = int(signals["winrate"] * 100)
        parts.append(f"win rate up {pct}%")
    
    if "blunders" in signals:
        reduction = abs(signals["blunders"])
        parts.append(f"{reduction:.1f} fewer blunders per game")
    
    for key, value in signals.items():
        if key.startswith("opening_"):
            eco = key.replace("opening_", "")
            pct = int(value * 100)
            parts.append(f"{eco} performance up {pct}%")
    
    if parts:
        return "Improvement detected: " + ", ".join(parts) + "."
    return "General improvement detected in your play."


def _build_regression_description(signals: Dict[str, Any]) -> str:
    """Build human-readable regression description."""
    parts = []
    
    if "blunders" in signals:
        increase = signals["blunders"]
        parts.append(f"{increase:.1f} more blunders per game")
    
    if "endgame_accuracy" in signals:
        drop = abs(signals["endgame_accuracy"])
        pct = int(drop * 100)
        parts.append(f"endgame accuracy down {pct}%")
    
    if parts:
        return "Area to focus on: " + ", ".join(parts) + "."
    return "Some areas may need attention."


# =============================================================================
# LLM VERBALIZATION (Strictly Limited)
# =============================================================================

async def verbalize_events(events: List[TrainerEvent]) -> Optional[str]:
    """
    Generate a natural language summary of detected events using LLM.
    
    STRICT RULES:
    - LLM only verbalizes the provided events
    - No analysis, no tactical advice
    - Keep output concise (< 150 tokens)
    
    Args:
        events: List of detected TrainerEvent objects
        
    Returns:
        Natural language summary or None if no events/LLM unavailable
    """
    if not events:
        return None
    
    if not ENABLE_PERSISTENT_TRAINER:
        return None
    
    # Limit events to verbalize
    events_to_verbalize = events[:MAX_EVENTS_TO_VERBALIZE]
    
    # Build event descriptions for prompt
    event_descriptions = []
    for e in events_to_verbalize:
        event_descriptions.append(f"- Type: {e.type}, Description: {e.description}")
    
    prompt = f"""You are a chess trainer summarizing observed trends for a player.

STRICT RULES:
- ONLY describe the events listed below
- Do NOT invent causes, moves, or tactics
- Keep tone factual and encouraging
- Maximum 2-3 sentences

DETECTED EVENTS:
{chr(10).join(event_descriptions)}

Write a brief, encouraging summary of what has changed in the player's recent games:"""

    # Try OpenAI (low token usage)
    api_key = os.getenv("OPENAI_API_KEY")
    
    if not api_key:
        # Fallback to simple concatenation
        return " ".join(e.description for e in events_to_verbalize)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": EVENT_SUMMARY_MAX_TOKENS,
                    "temperature": 0.3
                }
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return content.strip() if content else None
    except Exception as e:
        print(f"Event verbalization failed: {e}")
        # Fallback to simple descriptions
        return " ".join(e.description for e in events_to_verbalize)


def verbalize_events_sync(events: List[TrainerEvent]) -> Optional[str]:
    """Synchronous fallback for event verbalization (no LLM)."""
    if not events:
        return None
    
    events_to_verbalize = events[:MAX_EVENTS_TO_VERBALIZE]
    return " ".join(e.description for e in events_to_verbalize)


# =============================================================================
# MAIN INTEGRATION FUNCTION
# =============================================================================

def build_trainer_snapshot(
    user_id: str,
    time_control: str,
    side: str,
    raw_stats: Dict[str, Any]
) -> TrainerSnapshot:
    """
    Build a complete TrainerSnapshot from raw stats.
    
    This is the main entry point called from memory_snapshot_service.
    
    Args:
        user_id: User ID
        time_control: Time control filter
        side: Side filter
        raw_stats: Raw stats from compute_raw_stats_for_user
        
    Returns:
        Complete TrainerSnapshot with derived metrics, deltas, and events
    """
    import uuid
    
    # Compute derived metrics
    derived = compute_derived_metrics(raw_stats)
    
    # Get previous metrics for delta computation
    previous = get_previous_snapshot_metrics(user_id, time_control, side)
    
    # Compute deltas
    deltas = compute_snapshot_deltas(derived, previous)
    
    # Detect events
    events = detect_trainer_events(
        deltas,
        derived.sample_size,
        user_id,
        time_control,
        side
    )
    
    # Determine period based on sample size
    period: Literal["last_20_games", "last_50_games"] = (
        "last_50_games" if derived.sample_size >= 50 else "last_20_games"
    )
    
    # Create snapshot
    snapshot = TrainerSnapshot(
        snapshot_id=str(uuid.uuid4()),
        period=period,
        raw_stats=raw_stats,
        derived_metrics=derived,
        derived_deltas=deltas,
        events=events,
        timestamp=datetime.utcnow()
    )
    
    # Store in cache
    store_snapshot(user_id, time_control, side, snapshot)
    
    return snapshot
