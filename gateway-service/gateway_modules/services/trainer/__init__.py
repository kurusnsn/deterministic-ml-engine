"""
Trainer Services.

Persistent Personal Trainer that CONSUMES ML pipeline outputs
to detect trends and generate event-based coaching messages.

NO ML - only consumes existing report outputs.
"""

from .trainer_snapshot_service import (
    MLTrainerSnapshot,
    extract_snapshot_from_report,
    process_report_for_trainer,
    get_previous_ml_snapshot,
    get_current_ml_snapshot,
    get_ml_snapshot_history,
    store_ml_snapshot,
)

from .trainer_delta_service import (
    TrainerDelta,
    compute_trainer_delta,
    summarize_delta,
)

from .trainer_event_service import (
    MLTrainerEvent,
    detect_ml_trainer_events,
    detect_improvement,
    detect_regression,
    detect_stagnation,
    detect_false_confidence,
    detect_consistency,
)

__all__ = [
    # Snapshot
    "MLTrainerSnapshot",
    "extract_snapshot_from_report",
    "process_report_for_trainer",
    "get_previous_ml_snapshot",
    "get_current_ml_snapshot",
    "get_ml_snapshot_history",
    "store_ml_snapshot",
    # Delta
    "TrainerDelta",
    "compute_trainer_delta",
    "summarize_delta",
    # Events
    "MLTrainerEvent",
    "detect_ml_trainer_events",
    "detect_improvement",
    "detect_regression",
    "detect_stagnation",
    "detect_false_confidence",
    "detect_consistency",
]
