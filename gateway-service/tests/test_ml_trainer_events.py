"""
Tests for ML Trainer Services.

Tests snapshot extraction, delta computation, and event detection
for the persistent trainer that consumes ML pipeline outputs.
"""

import pytest
from unittest.mock import patch
from datetime import datetime, timedelta


class TestMLTrainerSnapshot:
    """Tests for snapshot extraction from reports."""
    
    def test_extract_snapshot_from_report(self):
        """Test extracting snapshot from a full report."""
        from gateway_modules.services.trainer import extract_snapshot_from_report
        
        report = {
            "overall_winrate": 0.58,
            "total_games": 75,
            "playstyle_profile": {
                "overall": {
                    "tactical": 0.65,
                    "positional": 0.35,
                    "aggressive": 0.55,
                    "defensive": 0.45,
                    "open_positions": 0.6,
                    "closed_positions": 0.4
                }
            },
            "insights": [
                {"type": "blunder"},
                {"type": "improvement"},
                {"type": "improvement"}
            ],
            "generated_puzzles": [
                {"puzzle_id": "1", "quality_score": 0.8},
                {"puzzle_id": "2", "quality_score": 0.9}
            ],
            "weak_lines": [
                {"tactical_issues": ["fork", "pin"]}
            ]
        }
        
        snapshot = extract_snapshot_from_report(report, "test-user")
        
        assert snapshot.overall_winrate == 0.58
        assert snapshot.total_games == 75
        assert snapshot.style_vector == [0.65, 0.35, 0.55, 0.45, 0.6, 0.4]
        assert snapshot.insight_counts == {"blunder": 1, "improvement": 2}
        assert snapshot.puzzle_count == 2
        assert snapshot.avg_puzzle_quality == pytest.approx(0.85)
        assert "fork" in snapshot.top_motifs
    
    def test_extract_from_minimal_report(self):
        """Test extraction from minimal report data."""
        from gateway_modules.services.trainer import extract_snapshot_from_report
        
        report = {
            "overall_winrate": 0.5,
            "total_games": 10
        }
        
        snapshot = extract_snapshot_from_report(report, "test-user")
        
        assert snapshot.overall_winrate == 0.5
        assert snapshot.total_games == 10
        assert snapshot.style_vector == [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
        assert snapshot.puzzle_count == 0
        assert snapshot.avg_puzzle_quality is None
    
    def test_snapshot_serialization(self):
        """Test snapshot to_dict and from_dict."""
        from gateway_modules.services.trainer import extract_snapshot_from_report, MLTrainerSnapshot
        
        report = {"overall_winrate": 0.6, "total_games": 50}
        snapshot = extract_snapshot_from_report(report, "test-user")
        
        data = snapshot.to_dict()
        restored = MLTrainerSnapshot.from_dict(data)
        
        assert restored.overall_winrate == snapshot.overall_winrate
        assert restored.snapshot_id == snapshot.snapshot_id


class TestTrainerDelta:
    """Tests for delta computation between snapshots."""
    
    def test_delta_no_previous(self):
        """Test delta with no previous snapshot."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta
        )
        
        report = {"overall_winrate": 0.55, "total_games": 30}
        current = extract_snapshot_from_report(report, "test-user")
        
        delta = compute_trainer_delta(current, None)
        
        assert delta.days_between == 0
        assert delta.games_delta == 30
        assert delta.overall_winrate_delta == 0
        assert delta.style_similarity == 1.0
    
    def test_delta_with_improvement(self):
        """Test delta showing improvement."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta
        )
        
        prev_report = {"overall_winrate": 0.5, "total_games": 50}
        curr_report = {"overall_winrate": 0.6, "total_games": 75}
        
        prev = extract_snapshot_from_report(prev_report, "test-user")
        curr = extract_snapshot_from_report(curr_report, "test-user")
        
        delta = compute_trainer_delta(curr, prev)
        
        assert delta.overall_winrate_delta == 0.1
        assert delta.games_delta == 25
    
    def test_delta_style_similarity(self):
        """Test style vector similarity computation."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta
        )
        
        # Same style
        report1 = {
            "overall_winrate": 0.5, "total_games": 50,
            "playstyle_profile": {
                "overall": {
                    "tactical": 0.7, "positional": 0.3,
                    "aggressive": 0.6, "defensive": 0.4,
                    "open_positions": 0.5, "closed_positions": 0.5
                }
            }
        }
        report2 = {
            "overall_winrate": 0.55, "total_games": 60,
            "playstyle_profile": {
                "overall": {
                    "tactical": 0.7, "positional": 0.3,
                    "aggressive": 0.6, "defensive": 0.4,
                    "open_positions": 0.5, "closed_positions": 0.5
                }
            }
        }
        
        prev = extract_snapshot_from_report(report1, "test-user")
        curr = extract_snapshot_from_report(report2, "test-user")
        
        delta = compute_trainer_delta(curr, prev)
        
        # Identical style vectors should have similarity 1.0
        assert delta.style_similarity == 1.0


class TestMLTrainerEvents:
    """Tests for event detection from deltas."""
    
    def test_detect_improvement(self):
        """Test improvement event detection."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta,
            detect_improvement
        )
        
        prev_report = {"overall_winrate": 0.5, "total_games": 50}
        curr_report = {"overall_winrate": 0.6, "total_games": 75}  # +10% winrate
        
        prev = extract_snapshot_from_report(prev_report, "test-user")
        curr = extract_snapshot_from_report(curr_report, "test-user")
        delta = compute_trainer_delta(curr, prev)
        
        event = detect_improvement(delta, curr)
        
        assert event is not None
        assert event.type == "improvement"
        assert "winrate" in event.signals
    
    def test_detect_regression(self):
        """Test regression event detection."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta,
            detect_regression
        )
        
        prev_report = {"overall_winrate": 0.6, "total_games": 50}
        curr_report = {"overall_winrate": 0.5, "total_games": 75}  # -10% winrate
        
        prev = extract_snapshot_from_report(prev_report, "test-user")
        curr = extract_snapshot_from_report(curr_report, "test-user")
        delta = compute_trainer_delta(curr, prev)
        
        event = detect_regression(delta, curr)
        
        assert event is not None
        assert event.type == "regression"
        assert "winrate" in event.signals
    
    def test_no_events_when_flag_disabled(self):
        """Test that events are not detected when flag is disabled."""
        from gateway_modules.services.trainer import trainer_event_service as tes
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta
        )
        
        prev_report = {"overall_winrate": 0.5, "total_games": 50}
        curr_report = {"overall_winrate": 0.6, "total_games": 75}
        
        prev = extract_snapshot_from_report(prev_report, "test-user")
        curr = extract_snapshot_from_report(curr_report, "test-user")
        delta = compute_trainer_delta(curr, prev)
        
        with patch.object(tes, 'ENABLE_PERSISTENT_TRAINER', False):
            events = tes.detect_ml_trainer_events(curr, delta, "test-user")
        
        assert events == []
    
    def test_deterministic_event_detection(self):
        """Same input should produce same events."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            compute_trainer_delta,
            detect_ml_trainer_events
        )
        
        prev_report = {"overall_winrate": 0.5, "total_games": 50}
        curr_report = {"overall_winrate": 0.58, "total_games": 75}
        
        prev = extract_snapshot_from_report(prev_report, "test-user")
        curr = extract_snapshot_from_report(curr_report, "test-user")
        delta = compute_trainer_delta(curr, prev)
        
        results = [
            detect_ml_trainer_events(curr, delta, "test-user")
            for _ in range(3)
        ]
        
        # All should be identical
        for r in results[1:]:
            assert len(r) == len(results[0])
            for i, event in enumerate(r):
                assert event.type == results[0][i].type


class TestSnapshotCache:
    """Tests for in-memory snapshot caching."""
    
    def test_store_and_retrieve(self):
        """Test storing and retrieving snapshots."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            store_ml_snapshot,
            get_current_ml_snapshot
        )
        from gateway_modules.services.trainer.trainer_snapshot_service import _ml_snapshot_cache
        
        _ml_snapshot_cache.clear()
        
        report = {"overall_winrate": 0.55, "total_games": 40}
        snapshot = extract_snapshot_from_report(report, "cache-test-user")
        
        store_ml_snapshot("cache-test-user", snapshot)
        retrieved = get_current_ml_snapshot("cache-test-user")
        
        assert retrieved is not None
        assert retrieved.snapshot_id == snapshot.snapshot_id
    
    def test_cache_pruning(self):
        """Test that old snapshots are pruned."""
        from gateway_modules.services.trainer import (
            extract_snapshot_from_report,
            store_ml_snapshot,
            get_ml_snapshot_history
        )
        from gateway_modules.services.trainer.trainer_snapshot_service import (
            _ml_snapshot_cache,
            MAX_SNAPSHOTS_PER_USER
        )
        
        _ml_snapshot_cache.clear()
        
        # Add more than max snapshots
        for i in range(MAX_SNAPSHOTS_PER_USER + 5):
            report = {"overall_winrate": 0.5 + i * 0.01, "total_games": 30 + i}
            snapshot = extract_snapshot_from_report(report, "prune-test-user")
            store_ml_snapshot("prune-test-user", snapshot)
        
        history = get_ml_snapshot_history("prune-test-user")
        
        assert len(history) == MAX_SNAPSHOTS_PER_USER
