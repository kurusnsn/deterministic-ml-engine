"""
ML Configuration for pipeline augmentations.

All ML features are behind feature flags and default to OFF.
This allows stepwise, reversible rollout of augmented behaviors.
"""

from dataclasses import dataclass, field
from typing import Literal, Optional
import os


@dataclass
class MLConfig:
    """
    Central configuration for all ML-augmented pipeline features.
    
    Hard constraints:
    - All features default to OFF
    - Existing heuristic behavior is never altered
    - dual_run mode allows side-by-side comparison
    """
    
    # Master switch
    enabled: bool = False
    
    # Dual-run mode: run baseline + augmented side-by-side and emit diffs
    dual_run: bool = False
    
    # Random seed for deterministic reproducibility
    random_seed: Optional[int] = None
    
    # ==========================================================================
    # Step 1: Puzzle Quality Scoring
    # ==========================================================================
    puzzle_quality_scoring: bool = False
    
    # Weights for quality score components (must sum to 1.0)
    quality_weight_severity: float = 0.4
    quality_weight_clarity: float = 0.3
    quality_weight_tactical: float = 0.3
    
    # Phase penalty for opening positions
    quality_opening_phase_penalty: float = 0.7
    
    # Redundancy threshold (same motif+ECO appearing N times)
    quality_redundancy_penalty_threshold: int = 3
    quality_redundancy_penalty_factor: float = 0.8
    
    # ==========================================================================
    # Step 2: MultiPV Forcedness Filter
    # ==========================================================================
    multipv_forcedness_filter: bool = False
    
    # Number of PV lines to request from Stockfish
    multipv_count: int = 3
    
    # Threshold for considering a move "forced"
    forced_threshold_cp: int = 150
    
    # "soft" = reduce quality_score by 0.6 if not forced
    # "hard" = drop puzzles with is_forced == False
    forcedness_mode: Literal["soft", "hard"] = "soft"
    forcedness_soft_penalty: float = 0.6
    
    # ==========================================================================
    # Step 3: Motif Cost Prioritization
    # ==========================================================================
    motif_cost_prioritization: bool = False
    
    # Number of top motifs to consider
    motif_top_k: int = 3
    
    # ==========================================================================
    # Step 4: Opening Residuals
    # ==========================================================================
    opening_residuals: bool = False
    
    # Minimum games per opening to compute residual
    residual_min_games: int = 5
    
    # Thresholds for residual labels
    residual_overperform_threshold: float = 0.10  # +10% above expected
    residual_underperform_threshold: float = -0.10  # -10% below expected
    
    # ==========================================================================
    # Step 5: Adaptive Repertoire Classification
    # ==========================================================================
    adaptive_repertoire_classifier: bool = False
    
    # Confidence threshold to override baseline category
    override_confidence: float = 0.70
    
    # ==========================================================================
    # Step 6: Eval-Curve Clustering
    # ==========================================================================
    eval_curve_clustering: bool = False
    
    # Minimum games to run clustering
    clustering_min_games: int = 10
    
    # HDBSCAN parameters
    hdbscan_min_cluster_size: int = 5
    hdbscan_min_samples: int = 3
    
    # Plies to sample for eval curve
    eval_curve_plies: tuple = (10, 12, 14, 16, 18, 20)
    
    # ==========================================================================
    # Step 7: Style Embeddings
    # ==========================================================================
    style_embeddings: bool = False
    
    # Embedding dimension for proxy embeddings
    embedding_dim: int = 32
    
    # ==========================================================================
    # LC0 Premium Augmentation (additive, feature-flagged, reversible)
    # ==========================================================================
    # Per-feature flags (all default OFF)
    lc0_premium_reports: bool = False
    lc0_premium_puzzles: bool = False
    lc0_premium_repertoire: bool = False
    lc0_premium_insights: bool = False
    
    # Global shortcut - enables all LC0 premium features
    lc0_premium_all: bool = False
    
    # Sampling and performance limits
    lc0_max_positions_per_report: int = 80
    lc0_timeout_seconds: float = 30.0
    
    @classmethod
    def from_env(cls) -> "MLConfig":
        """
        Create MLConfig from environment variables.
        
        Environment variables:
        - ML_ENABLED: "true" or "false"
        - ML_DUAL_RUN: "true" or "false"
        - ML_PUZZLE_QUALITY_SCORING: "true" or "false"
        - ML_MULTIPV_FORCEDNESS_FILTER: "true" or "false"
        - ML_MOTIF_COST_PRIORITIZATION: "true" or "false"
        - ML_OPENING_RESIDUALS: "true" or "false"
        - ML_ADAPTIVE_REPERTOIRE_CLASSIFIER: "true" or "false"
        - ML_EVAL_CURVE_CLUSTERING: "true" or "false"
        - ML_STYLE_EMBEDDINGS: "true" or "false"
        """
        def env_bool(key: str, default: bool = False) -> bool:
            return os.getenv(key, str(default)).lower() in ("true", "1", "yes")
        
        def env_int(key: str, default: int) -> int:
            try:
                return int(os.getenv(key, str(default)))
            except ValueError:
                return default
        
        def env_float(key: str, default: float) -> float:
            try:
                return float(os.getenv(key, str(default)))
            except ValueError:
                return default
        
        return cls(
            enabled=env_bool("ML_ENABLED"),
            dual_run=env_bool("ML_DUAL_RUN"),
            random_seed=env_int("ML_RANDOM_SEED", 0) or None,
            puzzle_quality_scoring=env_bool("ML_PUZZLE_QUALITY_SCORING"),
            multipv_forcedness_filter=env_bool("ML_MULTIPV_FORCEDNESS_FILTER"),
            motif_cost_prioritization=env_bool("ML_MOTIF_COST_PRIORITIZATION"),
            opening_residuals=env_bool("ML_OPENING_RESIDUALS"),
            adaptive_repertoire_classifier=env_bool("ML_ADAPTIVE_REPERTOIRE_CLASSIFIER"),
            eval_curve_clustering=env_bool("ML_EVAL_CURVE_CLUSTERING"),
            style_embeddings=env_bool("ML_STYLE_EMBEDDINGS"),
            # LC0 Premium flags
            lc0_premium_reports=env_bool("LC0_PREMIUM_REPORTS"),
            lc0_premium_puzzles=env_bool("LC0_PREMIUM_PUZZLES"),
            lc0_premium_repertoire=env_bool("LC0_PREMIUM_REPERTOIRE"),
            lc0_premium_insights=env_bool("LC0_PREMIUM_INSIGHTS"),
            lc0_premium_all=env_bool("LC0_PREMIUM_ALL"),
            lc0_max_positions_per_report=env_int("LC0_MAX_POSITIONS_PER_REPORT", 80),
            lc0_timeout_seconds=env_float("LC0_TIMEOUT_SECONDS", 30.0),
        )
    
    def is_step_enabled(self, step: str) -> bool:
        """Check if a specific step is enabled (requires master switch too)."""
        if not self.enabled:
            return False
        return getattr(self, step, False)


# Default global config instance (all OFF)
_default_ml_config = MLConfig()


def get_ml_config() -> MLConfig:
    """Get the current ML configuration."""
    return _default_ml_config


def set_ml_config(config: MLConfig) -> None:
    """Set the global ML configuration (for testing)."""
    global _default_ml_config
    _default_ml_config = config
