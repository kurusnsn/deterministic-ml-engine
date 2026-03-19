"""
Unit tests for Eval-Curve Clustering (Step 6).

Tests verify:
- Feature extraction from eval curves
- Clustering produces valid labels
- Rule-based fallback works when HDBSCAN unavailable
- Opening-level profiles computed correctly
"""

import pytest
from typing import Dict, Any, List

from gateway_modules.services.eval_curve_clustering import (
    extract_eval_curve_features,
    cluster_eval_curves_rules,
    label_cluster,
    cluster_games_by_opening,
    enrich_opening_with_cluster_profile,
    EvalCurveFeatures,
    CLUSTER_LABELS,
)


class TestEvalCurveFeatures:
    """Test feature extraction."""
    
    def test_empty_evals_returns_default(self):
        """Empty eval list returns default features."""
        features = extract_eval_curve_features("g1", [])
        assert features.mean_eval == 0.0
        assert features.std_eval == 0.0
    
    def test_single_eval_returns_default(self):
        """Single eval insufficient for stats."""
        features = extract_eval_curve_features("g1", [100])
        assert features.std_eval == 0.0
    
    def test_stable_evals_low_volatility(self):
        """Stable evals produce low volatility."""
        evals = [50, 55, 60, 55, 50, 55]
        features = extract_eval_curve_features("g1", evals)
        
        assert features.volatility < 0.5
        assert features.swing_count == 0  # No swings > 100cp
    
    def test_volatile_evals_high_sharpness(self):
        """Volatile evals produce high volatility/sharpness."""
        evals = [0, 200, -100, 300, -200, 400]
        features = extract_eval_curve_features("g1", evals)
        
        assert features.swing_count >= 3
        assert features.max_swing >= 200
    
    def test_to_vector_correct_length(self):
        """Feature vector has correct length."""
        features = extract_eval_curve_features("g1", [0, 100, 200])
        vec = features.to_vector()
        assert len(vec) == 6


class TestRuleBasedClustering:
    """Test rule-based clustering fallback."""
    
    def test_solid_cluster(self):
        """Low volatility, few swings -> solid."""
        features = EvalCurveFeatures(
            game_id="g1",
            volatility=0.2,
            swing_count=1,
            sharpness=0.1,
        )
        labels = cluster_eval_curves_rules([features])
        assert labels[0] == 0  # solid
    
    def test_sharp_cluster(self):
        """High sharpness, many swings -> sharp."""
        features = EvalCurveFeatures(
            game_id="g1",
            volatility=0.4,
            swing_count=6,
            sharpness=0.8,
        )
        labels = cluster_eval_curves_rules([features])
        assert labels[0] == 1  # sharp
    
    def test_volatile_cluster(self):
        """High volatility -> volatile."""
        features = EvalCurveFeatures(
            game_id="g1",
            volatility=0.7,
            swing_count=2,
            sharpness=0.3,
        )
        labels = cluster_eval_curves_rules([features])
        assert labels[0] == 2  # volatile


class TestClusterLabels:
    """Test cluster label mapping."""
    
    def test_label_solid(self):
        assert label_cluster(0) == "solid"
    
    def test_label_sharp(self):
        assert label_cluster(1) == "sharp"
    
    def test_label_volatile(self):
        assert label_cluster(2) == "volatile"
    
    def test_label_noise(self):
        assert label_cluster(-1) == "noise"


class TestClusterGamesByOpening:
    """Test full clustering pipeline."""
    
    def test_clusters_games(self):
        """Games are clustered by eval curve."""
        games = [
            {"game_id": "g1", "eco": "B20", "eval_curve": [0, 50, 100, 150]},
            {"game_id": "g2", "eco": "B20", "eval_curve": [0, 200, -100, 300]},
            {"game_id": "g3", "eco": "B20", "eval_curve": [0, 30, 50, 40]},
        ]
        
        result = cluster_games_by_opening(games)
        
        assert "cluster_stats" in result
        assert "game_clusters" in result
        assert len(result["game_clusters"]) == 3
    
    def test_empty_games(self):
        """Empty game list handled gracefully."""
        result = cluster_games_by_opening([])
        assert result["cluster_stats"] == []


class TestEnrichOpeningWithClusterProfile:
    """Test adding cluster profile to opening stats."""
    
    def test_adds_cluster_profile(self):
        """Profile added with dominant style."""
        opening_stats = {"eco": "B20", "winrate": 0.55}
        cluster_result = {
            "cluster_stats": [
                {"cluster_id": 0, "label": "solid", "count": 20},
                {"cluster_id": 1, "label": "sharp", "count": 5},
            ],
            "has_hdbscan": False,
        }
        
        enriched = enrich_opening_with_cluster_profile(opening_stats, cluster_result)
        
        assert "cluster_profile" in enriched
        assert enriched["cluster_profile"]["dominant_style"] == "solid"
        assert enriched["cluster_profile"]["dominant_pct"] == 0.8  # 20/25
    
    def test_empty_cluster_result(self):
        """Empty cluster result handled gracefully."""
        opening_stats = {"eco": "B20"}
        cluster_result = {"cluster_stats": []}
        
        enriched = enrich_opening_with_cluster_profile(opening_stats, cluster_result)
        
        assert enriched["cluster_profile"] is None
