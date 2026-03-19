"""
Memory services for Personal Trainer feature.
Provides vector storage, game summarization, and memory snapshot management.
"""

from .vector_store import (
    init_vector_store,
    index_game_summary,
    search_user_games
)
from .game_memory_service import (
    build_game_summary_input,
    summarize_game_for_memory,
    process_game_for_memory
)
from .memory_snapshot_service import (
    compute_raw_stats_for_user,
    select_key_positions_for_training,
    rebuild_memory_snapshot
)

# Persistent trainer exports (optional, feature-flagged)
try:
    from .config import ENABLE_PERSISTENT_TRAINER
    from .trainer_events import (
        TrainerSnapshot,
        TrainerEvent,
        DerivedMetrics,
        build_trainer_snapshot,
        get_cached_trainer_snapshot,
        detect_trainer_events,
    )
except ImportError:
    # Optional module not installed
    pass

__all__ = [
    "init_vector_store",
    "index_game_summary",
    "search_user_games",
    "build_game_summary_input",
    "summarize_game_for_memory",
    "process_game_for_memory",
    "compute_raw_stats_for_user",
    "select_key_positions_for_training",
    "rebuild_memory_snapshot",
    # Persistent trainer
    "ENABLE_PERSISTENT_TRAINER",
    "TrainerSnapshot",
    "TrainerEvent",
    "DerivedMetrics",
    "build_trainer_snapshot",
    "get_cached_trainer_snapshot",
    "detect_trainer_events",
]
