"""
Tests for persistent trainer events module.

Tests cover:
- Derived metrics computation
- Snapshot delta computation
- Event detection (all 5 types)
- Feature flag behavior
- Deterministic output
"""

import pytest
from unittest.mock import patch
import os


class TestDerivedMetrics:
    """Tests for compute_derived_metrics function."""
    
    def test_compute_metrics_from_raw_stats(self):
        """Test derived metrics calculation from typical raw stats."""
        from gateway_modules.services.memory.trainer_events import compute_derived_metrics
        
        raw_stats = {
            "sample_size": 50,
            "wins": 25,
            "losses": 20,
            "draws": 5,
            "blunders_per_game": 1.5,
            "blunder_distribution": {
                "opening": 10,
                "middlegame": 30,
                "endgame": 10
            },
            "top_openings": [
                {"eco": "B20", "name": "Sicilian", "score": 0.65},
                {"eco": "C50", "name": "Italian", "score": 0.45}
            ]
        }
        
        result = compute_derived_metrics(raw_stats)
        
        assert result.sample_size == 50
        assert result.winrate == 0.55  # (25 + 0.5*5) / 50
        assert result.blunders_per_game == 1.5
        assert "B20" in result.opening_scores
        assert result.opening_scores["B20"] == 0.65
        assert result.endgame_accuracy is not None
        assert 0 <= result.variance <= 1
    
    def test_empty_raw_stats_returns_defaults(self):
        """Test handling of missing data returns sensible defaults."""
        from gateway_modules.services.memory.trainer_events import compute_derived_metrics
        
        raw_stats = {}
        
        result = compute_derived_metrics(raw_stats)
        
        assert result.sample_size == 0
        assert result.winrate == 0.5
        assert result.blunders_per_game == 0.0
        assert result.opening_scores == {}
    
    def test_zero_games_returns_default_winrate(self):
        """Test winrate defaults to 0.5 when no games."""
        from gateway_modules.services.memory.trainer_events import compute_derived_metrics
        
        raw_stats = {
            "sample_size": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0
        }
        
        result = compute_derived_metrics(raw_stats)
        
        assert result.winrate == 0.5


class TestSnapshotDeltas:
    """Tests for compute_snapshot_deltas function."""
    
    def test_delta_computation_positive(self):
        """Test delta when metrics improve."""
        from gateway_modules.services.memory.trainer_events import (
            compute_snapshot_deltas,
            DerivedMetrics
        )
        
        current = DerivedMetrics(
            winrate=0.60,
            blunders_per_game=1.0,
            opening_scores={"B20": 0.70},
            endgame_accuracy=0.80,
            variance=0.05,
            sample_size=50
        )
        previous = DerivedMetrics(
            winrate=0.52,
            blunders_per_game=1.5,
            opening_scores={"B20": 0.55},
            endgame_accuracy=0.72,
            variance=0.10,
            sample_size=40
        )
        
        deltas = compute_snapshot_deltas(current, previous)
        
        assert deltas["winrate_delta"] == 0.08  # Improved
        assert deltas["blunders_per_game_delta"] == -0.5  # Improved (negative)
        assert deltas["endgame_accuracy_delta"] == 0.08  # Improved
        assert "opening_B20_delta" in deltas
        assert deltas["opening_B20_delta"] == 0.15  # Improved
    
    def test_delta_computation_negative(self):
        """Test delta when metrics regress."""
        from gateway_modules.services.memory.trainer_events import (
            compute_snapshot_deltas,
            DerivedMetrics
        )
        
        current = DerivedMetrics(
            winrate=0.45,
            blunders_per_game=2.0,
            endgame_accuracy=0.60,
            variance=0.15,
            sample_size=50
        )
        previous = DerivedMetrics(
            winrate=0.55,
            blunders_per_game=1.2,
            endgame_accuracy=0.75,
            variance=0.08,
            sample_size=40
        )
        
        deltas = compute_snapshot_deltas(current, previous)
        
        assert deltas["winrate_delta"] == -0.10  # Regressed
        assert deltas["blunders_per_game_delta"] == 0.8  # Regressed (positive)
        assert deltas["endgame_accuracy_delta"] == -0.15  # Regressed
    
    def test_missing_previous_returns_empty(self):
        """Test first snapshot has no deltas."""
        from gateway_modules.services.memory.trainer_events import (
            compute_snapshot_deltas,
            DerivedMetrics
        )
        
        current = DerivedMetrics(winrate=0.55, sample_size=50)
        
        deltas = compute_snapshot_deltas(current, None)
        
        assert deltas == {}


class TestEventDetection:
    """Tests for event detection functions."""
    
    def test_improvement_event_triggered_by_winrate(self):
        """Winrate +7% should trigger improvement."""
        from gateway_modules.services.memory.trainer_events import detect_improvement_event
        
        deltas = {"winrate_delta": 0.07}
        
        event = detect_improvement_event(deltas, sample_size=20)
        
        assert event is not None
        assert event.type == "improvement"
        assert "winrate" in event.signal
    
    def test_improvement_event_triggered_by_blunders(self):
        """Blunders decrease should trigger improvement."""
        from gateway_modules.services.memory.trainer_events import detect_improvement_event
        
        deltas = {"blunders_per_game_delta": -0.4}
        
        event = detect_improvement_event(deltas, sample_size=20)
        
        assert event is not None
        assert event.type == "improvement"
        assert "blunders" in event.signal
    
    def test_regression_event_triggered(self):
        """Blunders +0.5/game should trigger regression."""
        from gateway_modules.services.memory.trainer_events import detect_regression_event
        
        deltas = {"blunders_per_game_delta": 0.5}
        
        event = detect_regression_event(deltas, sample_size=20)
        
        assert event is not None
        assert event.type == "regression"
        assert "blunders" in event.signal
    
    def test_false_confidence_event(self):
        """Good results but flat concepts should trigger false confidence."""
        from gateway_modules.services.memory.trainer_events import detect_false_confidence_event
        
        deltas = {
            "winrate_delta": 0.08,  # Results improving
            "blunders_per_game_delta": 0.1  # But blunders not improving
        }
        
        event = detect_false_confidence_event(deltas, sample_size=20)
        
        assert event is not None
        assert event.type == "false_confidence"
    
    def test_consistency_event(self):
        """Decreasing variance should trigger consistency."""
        from gateway_modules.services.memory.trainer_events import detect_consistency_event
        
        deltas = {"variance_delta": -0.15}
        
        event = detect_consistency_event(deltas, sample_size=20)
        
        assert event is not None
        assert event.type == "consistency"
    
    def test_no_event_when_thresholds_not_met(self):
        """Small deltas should not trigger any events."""
        from gateway_modules.services.memory.trainer_events import (
            detect_improvement_event,
            detect_regression_event,
            detect_consistency_event
        )
        
        small_deltas = {
            "winrate_delta": 0.02,
            "blunders_per_game_delta": 0.1,
            "variance_delta": -0.05
        }
        
        assert detect_improvement_event(small_deltas, 20) is None
        assert detect_regression_event(small_deltas, 20) is None
        assert detect_consistency_event(small_deltas, 20) is None
    
    def test_no_events_when_flag_disabled(self):
        """Verify feature flag disables all event detection."""
        from gateway_modules.services.memory import trainer_events as te
        
        deltas = {
            "winrate_delta": 0.10,
            "blunders_per_game_delta": -0.5
        }
        
        # Mock the flag to False
        with patch.object(te, 'ENABLE_PERSISTENT_TRAINER', False):
            events = te.detect_trainer_events(deltas, sample_size=50)
        
        assert events == []
    
    def test_deterministic_output(self):
        """Same input should always produce same events."""
        from gateway_modules.services.memory.trainer_events import detect_trainer_events
        
        deltas = {
            "winrate_delta": 0.08,
            "blunders_per_game_delta": -0.35
        }
        
        # Run multiple times
        results = [
            detect_trainer_events(deltas, sample_size=30)
            for _ in range(5)
        ]
        
        # All should be identical
        for r in results[1:]:
            assert len(r) == len(results[0])
            for i, event in enumerate(r):
                assert event.type == results[0][i].type
                assert event.signal == results[0][i].signal


class TestTrainerSnapshot:
    """Tests for TrainerSnapshot creation."""
    
    def test_build_trainer_snapshot(self):
        """Test full snapshot building."""
        from gateway_modules.services.memory.trainer_events import (
            build_trainer_snapshot,
            TrainerSnapshot
        )
        
        raw_stats = {
            "sample_size": 30,
            "wins": 15,
            "losses": 12,
            "draws": 3,
            "blunders_per_game": 1.2,
            "blunder_distribution": {
                "opening": 5,
                "middlegame": 15,
                "endgame": 10
            },
            "top_openings": []
        }
        
        snapshot = build_trainer_snapshot(
            user_id="test-user",
            time_control="blitz",
            side="white",
            raw_stats=raw_stats
        )
        
        assert isinstance(snapshot, TrainerSnapshot)
        assert snapshot.period == "last_20_games"  # < 50 games
        assert snapshot.derived_metrics.sample_size == 30
        assert snapshot.raw_stats == raw_stats
    
    def test_snapshot_serialization(self):
        """Test snapshot to_dict serialization."""
        from gateway_modules.services.memory.trainer_events import build_trainer_snapshot
        
        snapshot = build_trainer_snapshot(
            user_id="test-user",
            time_control="all",
            side="both",
            raw_stats={"sample_size": 25, "wins": 10, "losses": 10, "draws": 5}
        )
        
        data = snapshot.to_dict()
        
        assert "snapshot_id" in data
        assert "period" in data
        assert "derived_metrics" in data
        assert "derived_deltas" in data
        assert "events" in data
        assert isinstance(data["timestamp"], str)


class TestSnapshotCache:
    """Tests for in-memory snapshot caching."""
    
    def test_store_and_retrieve_snapshot(self):
        """Test snapshot storage and retrieval."""
        from gateway_modules.services.memory.trainer_events import (
            store_snapshot,
            get_cached_trainer_snapshot,
            TrainerSnapshot,
            DerivedMetrics,
            _snapshot_history_cache
        )
        from datetime import datetime
        
        # Clear cache first
        _snapshot_history_cache.clear()
        
        snapshot = TrainerSnapshot(
            snapshot_id="test-123",
            period="last_20_games",
            raw_stats={"sample_size": 20},
            derived_metrics=DerivedMetrics(winrate=0.55, sample_size=20),
            derived_deltas={},
            events=[],
            timestamp=datetime.utcnow()
        )
        
        store_snapshot("user-1", "blitz", "white", snapshot)
        retrieved = get_cached_trainer_snapshot("user-1", "blitz", "white")
        
        assert retrieved is not None
        assert retrieved.snapshot_id == "test-123"
    
    def test_cache_returns_none_when_empty(self):
        """Test retrieval from empty cache returns None."""
        from gateway_modules.services.memory.trainer_events import (
            get_cached_trainer_snapshot,
            _snapshot_history_cache
        )
        
        _snapshot_history_cache.clear()
        
        result = get_cached_trainer_snapshot("nonexistent", "all", "both")
        
        assert result is None
