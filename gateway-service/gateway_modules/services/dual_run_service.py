"""
Dual-run service for ML pipeline augmentations.

Provides infrastructure to run baseline and augmented pipelines side-by-side,
computing structured diffs between outputs for testing and validation.
"""

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Generic, List, Optional, TypeVar
from datetime import datetime

logger = logging.getLogger(__name__)


T = TypeVar("T")


@dataclass
class DualRunEnvelope(Generic[T]):
    """
    Common output envelope for augmented artifacts.
    
    Contains baseline output, augmented output, and structured diff.
    """
    
    # Original output (without ML augmentation)
    baseline: T
    
    # Augmented output (with ML features enabled)
    augmented: Optional[T] = None
    
    # Structured differences between baseline and augmented
    diff: Dict[str, Any] = field(default_factory=dict)
    
    # Metadata for the dual run
    run_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    # Statistics
    baseline_time_ms: Optional[float] = None
    augmented_time_ms: Optional[float] = None
    
    # Error tracking
    baseline_error: Optional[str] = None
    augmented_error: Optional[str] = None


@dataclass
class DualRunStats:
    """Statistics for dual-run execution."""
    
    games_processed: int = 0
    moves_analyzed: int = 0
    puzzles_generated: int = 0
    puzzles_with_quality_score: int = 0
    puzzles_filtered_by_forcedness: int = 0
    openings_with_residuals: int = 0
    categories_overridden: int = 0
    clusters_found: int = 0
    
    def to_dict(self) -> Dict[str, int]:
        return {
            "games_processed": self.games_processed,
            "moves_analyzed": self.moves_analyzed,
            "puzzles_generated": self.puzzles_generated,
            "puzzles_with_quality_score": self.puzzles_with_quality_score,
            "puzzles_filtered_by_forcedness": self.puzzles_filtered_by_forcedness,
            "openings_with_residuals": self.openings_with_residuals,
            "categories_overridden": self.categories_overridden,
            "clusters_found": self.clusters_found,
        }


class DualRunLogger:
    """
    Deterministic, seedable logging with identifiers per game/move/puzzle.
    """
    
    def __init__(self, seed: Optional[int] = None):
        self.seed = seed
        self.counters: Dict[str, int] = {
            "game": 0,
            "move": 0,
            "puzzle": 0,
            "opening": 0,
            "cluster": 0,
        }
        self.stats = DualRunStats()
        self.events: List[Dict[str, Any]] = []
    
    def generate_id(self, entity_type: str, context: Optional[str] = None) -> str:
        """Generate a deterministic, traceable ID for an entity."""
        self.counters[entity_type] = self.counters.get(entity_type, 0) + 1
        count = self.counters[entity_type]
        
        if self.seed is not None:
            # Deterministic ID based on seed and count
            seed_str = f"{self.seed}:{entity_type}:{count}"
            hash_val = hashlib.md5(seed_str.encode()).hexdigest()[:8]
            return f"{entity_type}_{hash_val}"
        else:
            # Random UUID-based ID
            return f"{entity_type}_{uuid.uuid4().hex[:8]}"
    
    def log_event(
        self,
        event_type: str,
        entity_id: str,
        data: Dict[str, Any],
        stage: str = "unknown"
    ) -> None:
        """Log a pipeline event for debugging and analysis."""
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "entity_id": entity_id,
            "stage": stage,
            "data": data,
        }
        self.events.append(event)
        logger.debug(f"[DualRun] {event_type} | {entity_id} | {stage}")
    
    def increment_stat(self, stat_name: str, delta: int = 1) -> None:
        """Increment a statistic counter."""
        current = getattr(self.stats, stat_name, 0)
        setattr(self.stats, stat_name, current + delta)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of the dual run."""
        return {
            "counters": dict(self.counters),
            "stats": self.stats.to_dict(),
            "event_count": len(self.events),
        }


def compute_diff(baseline: Any, augmented: Any, path: str = "") -> Dict[str, Any]:
    """
    Compute structured diff between baseline and augmented outputs.
    
    Returns a dict describing:
    - added: fields present in augmented but not baseline
    - removed: fields present in baseline but not augmented
    - changed: fields with different values
    - unchanged: count of fields that are identical
    """
    diff: Dict[str, Any] = {
        "added": [],
        "removed": [],
        "changed": [],
        "unchanged_count": 0,
    }
    
    if baseline is None and augmented is None:
        return diff
    
    if baseline is None:
        diff["added"].append({"path": path or "root", "value": _safe_repr(augmented)})
        return diff
    
    if augmented is None:
        diff["removed"].append({"path": path or "root", "value": _safe_repr(baseline)})
        return diff
    
    # Convert to dicts if they have __dict__ or are Pydantic models
    baseline_dict = _to_dict(baseline)
    augmented_dict = _to_dict(augmented)
    
    if isinstance(baseline_dict, dict) and isinstance(augmented_dict, dict):
        all_keys = set(baseline_dict.keys()) | set(augmented_dict.keys())
        
        for key in all_keys:
            key_path = f"{path}.{key}" if path else key
            
            if key not in baseline_dict:
                diff["added"].append({
                    "path": key_path,
                    "value": _safe_repr(augmented_dict[key])
                })
            elif key not in augmented_dict:
                diff["removed"].append({
                    "path": key_path,
                    "value": _safe_repr(baseline_dict[key])
                })
            elif baseline_dict[key] != augmented_dict[key]:
                diff["changed"].append({
                    "path": key_path,
                    "baseline": _safe_repr(baseline_dict[key]),
                    "augmented": _safe_repr(augmented_dict[key])
                })
            else:
                diff["unchanged_count"] += 1
    elif baseline_dict != augmented_dict:
        diff["changed"].append({
            "path": path or "root",
            "baseline": _safe_repr(baseline_dict),
            "augmented": _safe_repr(augmented_dict)
        })
    else:
        diff["unchanged_count"] += 1
    
    return diff


def _to_dict(obj: Any) -> Any:
    """Convert object to dict for comparison."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "__dict__"):
        return obj.__dict__
    return obj


def _safe_repr(obj: Any, max_len: int = 100) -> str:
    """Safe string representation for diff output."""
    try:
        s = str(obj)
        if len(s) > max_len:
            return s[:max_len] + "..."
        return s
    except Exception:
        return "<unrepresentable>"


async def run_dual_mode(
    baseline_fn: Callable[..., T],
    augmented_fn: Callable[..., T],
    *args,
    **kwargs
) -> DualRunEnvelope[T]:
    """
    Execute both baseline and augmented functions and compute diff.
    
    Args:
        baseline_fn: Function that produces baseline output
        augmented_fn: Function that produces augmented output
        *args, **kwargs: Arguments passed to both functions
        
    Returns:
        DualRunEnvelope containing both outputs and their diff
    """
    import time
    
    envelope = DualRunEnvelope[T](baseline=None)  # type: ignore
    
    # Run baseline
    try:
        start = time.perf_counter()
        if asyncio_iscoroutinefunction(baseline_fn):
            envelope.baseline = await baseline_fn(*args, **kwargs)
        else:
            envelope.baseline = baseline_fn(*args, **kwargs)
        envelope.baseline_time_ms = (time.perf_counter() - start) * 1000
    except Exception as e:
        envelope.baseline_error = str(e)
        logger.error(f"Baseline execution failed: {e}")
    
    # Run augmented
    try:
        start = time.perf_counter()
        if asyncio_iscoroutinefunction(augmented_fn):
            envelope.augmented = await augmented_fn(*args, **kwargs)
        else:
            envelope.augmented = augmented_fn(*args, **kwargs)
        envelope.augmented_time_ms = (time.perf_counter() - start) * 1000
    except Exception as e:
        envelope.augmented_error = str(e)
        logger.error(f"Augmented execution failed: {e}")
    
    # Compute diff
    if envelope.baseline is not None and envelope.augmented is not None:
        envelope.diff = compute_diff(envelope.baseline, envelope.augmented)
    
    return envelope


def asyncio_iscoroutinefunction(fn: Callable) -> bool:
    """Check if a function is a coroutine function."""
    import asyncio
    return asyncio.iscoroutinefunction(fn)


def verify_baseline_unchanged(
    baseline_snapshot: Any,
    current_baseline: Any
) -> bool:
    """
    Verify that baseline output is byte-for-byte identical to snapshot.
    
    Used in regression tests to ensure ML features don't affect baseline.
    """
    diff = compute_diff(baseline_snapshot, current_baseline)
    
    is_unchanged = (
        len(diff.get("added", [])) == 0 and
        len(diff.get("removed", [])) == 0 and
        len(diff.get("changed", [])) == 0
    )
    
    if not is_unchanged:
        logger.warning(f"Baseline changed! Diff: {json.dumps(diff, indent=2)}")
    
    return is_unchanged
