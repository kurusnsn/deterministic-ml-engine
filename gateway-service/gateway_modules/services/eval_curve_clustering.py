"""
Eval-Curve Clustering Service.

Clusters games by their evaluation curve shape to identify play styles.
Uses HDBSCAN for density-based clustering without requiring pre-specified
cluster count.

This is Step 6 of the ML pipeline augmentation.

Feature flag: ml_config.eval_curve_clustering

Note: HDBSCAN is optional. Falls back to simple rule-based clustering if unavailable.
"""

from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass, field
import warnings

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig

# Try to import HDBSCAN, fallback to rule-based if unavailable
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from hdbscan import HDBSCAN
    HAS_HDBSCAN = True
except ImportError:
    HAS_HDBSCAN = False


# Cluster labels
CLUSTER_LABELS = {
    0: "solid",       # Stable eval, minimal swings
    1: "sharp",       # Large swings, tactical positions
    2: "volatile",    # Erratic eval changes
    -1: "noise",      # Unclustered (outliers)
}


@dataclass
class EvalCurveFeatures:
    """Features extracted from a game's evaluation curve."""
    
    game_id: str = ""
    eco: str = ""
    
    # Curve statistics
    mean_eval: float = 0.0
    std_eval: float = 0.0
    max_swing: float = 0.0
    swing_count: int = 0
    trend_slope: float = 0.0
    
    # Derived features
    volatility: float = 0.0
    sharpness: float = 0.0
    
    def to_vector(self) -> List[float]:
        """Convert to feature vector for clustering."""
        return [
            self.std_eval / 300.0,  # Normalize
            self.max_swing / 600.0,
            self.swing_count / 10.0,
            abs(self.trend_slope) / 100.0,
            self.volatility,
            self.sharpness,
        ]


def extract_eval_curve_features(
    game_id: str,
    evals: List[int],
    eco: str = "",
) -> EvalCurveFeatures:
    """
    Extract features from a sequence of eval values.
    
    Args:
        game_id: Game identifier
        evals: List of centipawn evaluations throughout the game
        eco: ECO code of the opening
        
    Returns:
        EvalCurveFeatures with computed statistics
    """
    if not evals or len(evals) < 3:
        return EvalCurveFeatures(game_id=game_id, eco=eco)
    
    # Basic statistics
    if HAS_NUMPY:
        arr = np.array(evals, dtype=float)
        mean_eval = float(np.mean(arr))
        std_eval = float(np.std(arr))
    else:
        mean_eval = sum(evals) / len(evals)
        variance = sum((e - mean_eval) ** 2 for e in evals) / len(evals)
        std_eval = variance ** 0.5
    
    # Swing detection (eval changes > 100cp)
    swings = []
    for i in range(1, len(evals)):
        delta = abs(evals[i] - evals[i-1])
        if delta > 100:
            swings.append(delta)
    
    max_swing = max(swings) if swings else 0
    swing_count = len(swings)
    
    # Trend slope (linear regression)
    if HAS_NUMPY and len(evals) >= 3:
        x = np.arange(len(evals))
        coeffs = np.polyfit(x, arr, 1)
        trend_slope = float(coeffs[0])
    else:
        # Simple slope approximation
        trend_slope = (evals[-1] - evals[0]) / len(evals) if len(evals) > 1 else 0
    
    # Volatility: std / range (normalized)
    eval_range = max(evals) - min(evals) if len(evals) > 0 else 1
    volatility = std_eval / max(eval_range, 1)
    
    # Sharpness: swing count * average swing magnitude
    avg_swing = sum(swings) / len(swings) if swings else 0
    sharpness = (swing_count * avg_swing) / 1000  # Normalized
    
    return EvalCurveFeatures(
        game_id=game_id,
        eco=eco,
        mean_eval=mean_eval,
        std_eval=std_eval,
        max_swing=max_swing,
        swing_count=swing_count,
        trend_slope=trend_slope,
        volatility=volatility,
        sharpness=sharpness,
    )


def cluster_eval_curves_hdbscan(
    features_list: List[EvalCurveFeatures],
    min_cluster_size: int = 5,
) -> List[int]:
    """
    Cluster eval curves using HDBSCAN.
    
    Args:
        features_list: List of EvalCurveFeatures
        min_cluster_size: Minimum cluster size for HDBSCAN
        
    Returns:
        List of cluster labels (-1 = noise)
    """
    if not HAS_HDBSCAN or not HAS_NUMPY:
        # Fallback to rule-based clustering
        return cluster_eval_curves_rules(features_list)
    
    if len(features_list) < min_cluster_size:
        return [-1] * len(features_list)
    
    # Build feature matrix
    X = np.array([f.to_vector() for f in features_list])
    
    # Apply HDBSCAN
    clusterer = HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
    labels = clusterer.fit_predict(X)
    
    return labels.tolist()


def cluster_eval_curves_rules(
    features_list: List[EvalCurveFeatures],
) -> List[int]:
    """
    Rule-based clustering fallback when HDBSCAN unavailable.
    
    Returns cluster labels:
    - 0 = solid (low volatility, few swings)
    - 1 = sharp (high sharpness, many swings)
    - 2 = volatile (high volatility)
    """
    labels = []
    
    for f in features_list:
        if f.volatility < 0.3 and f.swing_count <= 2:
            labels.append(0)  # solid
        elif f.sharpness > 0.5 or f.swing_count >= 5:
            labels.append(1)  # sharp
        elif f.volatility > 0.5:
            labels.append(2)  # volatile
        else:
            labels.append(0)  # default to solid
    
    return labels


def label_cluster(cluster_id: int) -> str:
    """Convert cluster ID to human-readable label."""
    return CLUSTER_LABELS.get(cluster_id, "unknown")


@dataclass
class ClusterSummary:
    """Summary of a cluster."""
    
    cluster_id: int = 0
    label: str = ""
    count: int = 0
    avg_volatility: float = 0.0
    avg_sharpness: float = 0.0
    example_games: List[str] = field(default_factory=list)


def cluster_games_by_opening(
    games: List[Dict[str, Any]],
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Any]:
    """
    Cluster games by eval curve and return opening-level summary.
    
    Args:
        games: List of game dicts with eval_curve (list of cp values)
        ml_config: Optional ML configuration
        
    Returns:
        Dict with cluster assignments and summaries
    """
    min_cluster_size = 5
    if ml_config:
        min_cluster_size = getattr(ml_config, "min_cluster_size", 5)
    
    # Extract features for each game
    features_list = []
    for game in games:
        evals = game.get("eval_curve", [])
        features = extract_eval_curve_features(
            game_id=game.get("game_id", ""),
            evals=evals,
            eco=game.get("eco", ""),
        )
        features_list.append(features)
    
    if not features_list:
        return {"cluster_stats": [], "game_clusters": {}}
    
    # Cluster
    if HAS_HDBSCAN:
        labels = cluster_eval_curves_hdbscan(features_list, min_cluster_size)
    else:
        labels = cluster_eval_curves_rules(features_list)
    
    # Aggregate by cluster
    from collections import defaultdict
    cluster_data: Dict[int, List[EvalCurveFeatures]] = defaultdict(list)
    game_clusters: Dict[str, int] = {}
    
    for features, label in zip(features_list, labels):
        cluster_data[label].append(features)
        game_clusters[features.game_id] = label
    
    # Build summaries
    cluster_stats = []
    for cluster_id, members in cluster_data.items():
        summary = ClusterSummary(
            cluster_id=cluster_id,
            label=label_cluster(cluster_id),
            count=len(members),
            avg_volatility=sum(m.volatility for m in members) / len(members),
            avg_sharpness=sum(m.sharpness for m in members) / len(members),
            example_games=[m.game_id for m in members[:3]],
        )
        cluster_stats.append({
            "cluster_id": summary.cluster_id,
            "label": summary.label,
            "count": summary.count,
            "avg_volatility": round(summary.avg_volatility, 3),
            "avg_sharpness": round(summary.avg_sharpness, 3),
            "example_games": summary.example_games,
        })
    
    # Sort by count
    cluster_stats.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "cluster_stats": cluster_stats,
        "game_clusters": game_clusters,
        "has_hdbscan": HAS_HDBSCAN,
    }


def enrich_opening_with_cluster_profile(
    opening_stats: Dict[str, Any],
    cluster_result: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Add cluster profile to opening stats.
    
    Args:
        opening_stats: Opening statistics dict
        cluster_result: Result from cluster_games_by_opening
        
    Returns:
        Updated opening stats with cluster profile
    """
    cluster_stats = cluster_result.get("cluster_stats", [])
    
    if not cluster_stats:
        opening_stats["cluster_profile"] = None
        return opening_stats
    
    # Dominant cluster
    dominant = cluster_stats[0] if cluster_stats else None
    
    # Build profile
    profile = {
        "dominant_style": dominant["label"] if dominant else "unknown",
        "dominant_pct": round(dominant["count"] / sum(c["count"] for c in cluster_stats), 2) if dominant else 0,
        "style_distribution": {c["label"]: c["count"] for c in cluster_stats},
    }
    
    opening_stats["cluster_profile"] = profile
    opening_stats["has_hdbscan"] = cluster_result.get("has_hdbscan", False)
    
    return opening_stats
