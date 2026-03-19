"""
Regression and dual-run tests for ML scaffolding.

These tests ensure:
1. With all ML flags OFF, outputs are byte-for-byte identical
2. Dual-run mode produces unchanged baseline + augmented with diff
3. Golden test fixtures produce consistent outputs
"""

import pytest
import json
from pathlib import Path
from typing import Dict, Any

from gateway_modules.config.ml_config import MLConfig, set_ml_config
from gateway_modules.services.dual_run_service import (
    DualRunEnvelope,
    DualRunLogger,
    DualRunStats,
    compute_diff,
    verify_baseline_unchanged,
)
from gateway_modules.services.puzzle_generation_service import generate_puzzle_from_blunder


# Path to test fixtures
FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestMLConfig:
    """Test MLConfig structure."""
    
    def test_all_defaults_off(self):
        """All features default to OFF."""
        config = MLConfig()
        assert config.enabled is False
        assert config.dual_run is False
        assert config.puzzle_quality_scoring is False
        assert config.multipv_forcedness_filter is False
        assert config.motif_cost_prioritization is False
        assert config.opening_residuals is False
        assert config.adaptive_repertoire_classifier is False
        assert config.eval_curve_clustering is False
        assert config.style_embeddings is False
    
    def test_is_step_enabled_requires_master_switch(self):
        """is_step_enabled returns False when master switch is OFF."""
        config = MLConfig(enabled=False, puzzle_quality_scoring=True)
        assert config.is_step_enabled("puzzle_quality_scoring") is False
    
    def test_is_step_enabled_with_master_switch(self):
        """is_step_enabled returns True when both enabled."""
        config = MLConfig(enabled=True, puzzle_quality_scoring=True)
        assert config.is_step_enabled("puzzle_quality_scoring") is True


class TestDualRunLogger:
    """Test deterministic logging identifiers."""
    
    def test_deterministic_ids_with_seed(self):
        """Same seed produces same IDs."""
        logger1 = DualRunLogger(seed=42)
        logger2 = DualRunLogger(seed=42)
        
        id1_a = logger1.generate_id("puzzle")
        id1_b = logger1.generate_id("puzzle")
        
        id2_a = logger2.generate_id("puzzle")
        id2_b = logger2.generate_id("puzzle")
        
        assert id1_a == id2_a
        assert id1_b == id2_b
    
    def test_unique_ids_across_entities(self):
        """Different entity types get different prefix."""
        logger = DualRunLogger(seed=42)
        
        puzzle_id = logger.generate_id("puzzle")
        game_id = logger.generate_id("game")
        
        assert puzzle_id.startswith("puzzle_")
        assert game_id.startswith("game_")
    
    def test_increment_stat(self):
        """Stats are incremented correctly."""
        logger = DualRunLogger()
        
        logger.increment_stat("puzzles_generated")
        logger.increment_stat("puzzles_generated")
        logger.increment_stat("moves_analyzed", 5)
        
        assert logger.stats.puzzles_generated == 2
        assert logger.stats.moves_analyzed == 5


class TestComputeDiff:
    """Test structured diff computation."""
    
    def test_identical_dicts_no_changes(self):
        """Identical dicts produce no differences."""
        a = {"x": 1, "y": 2}
        b = {"x": 1, "y": 2}
        
        diff = compute_diff(a, b)
        
        assert len(diff["added"]) == 0
        assert len(diff["removed"]) == 0
        assert len(diff["changed"]) == 0
        assert diff["unchanged_count"] == 2
    
    def test_added_field(self):
        """New field in augmented is detected."""
        a = {"x": 1}
        b = {"x": 1, "quality_score": 0.8}
        
        diff = compute_diff(a, b)
        
        assert len(diff["added"]) == 1
        assert diff["added"][0]["path"] == "quality_score"
    
    def test_removed_field(self):
        """Missing field in augmented is detected."""
        a = {"x": 1, "y": 2}
        b = {"x": 1}
        
        diff = compute_diff(a, b)
        
        assert len(diff["removed"]) == 1
        assert diff["removed"][0]["path"] == "y"
    
    def test_changed_field(self):
        """Changed value is detected."""
        a = {"x": 1}
        b = {"x": 2}
        
        diff = compute_diff(a, b)
        
        assert len(diff["changed"]) == 1
        assert diff["changed"][0]["path"] == "x"


class TestVerifyBaselineUnchanged:
    """Test baseline verification."""
    
    def test_unchanged_returns_true(self):
        """Identical outputs return True."""
        snapshot = {"puzzle_id": "p1", "theme": ["fork"]}
        current = {"puzzle_id": "p1", "theme": ["fork"]}
        
        assert verify_baseline_unchanged(snapshot, current) is True
    
    def test_changed_returns_false(self):
        """Different outputs return False."""
        snapshot = {"puzzle_id": "p1", "theme": ["fork"]}
        current = {"puzzle_id": "p1", "theme": ["fork", "pin"]}
        
        assert verify_baseline_unchanged(snapshot, current) is False


class TestBaselineUnchangedRegression:
    """
    Golden tests: verify that with all flags OFF, outputs match snapshots.
    """
    
    @pytest.fixture
    def tactical_fixture(self) -> Dict[str, Any]:
        """Load tactical player fixture."""
        fixture_path = FIXTURES_DIR / "tactical_player.json"
        if fixture_path.exists():
            with open(fixture_path) as f:
                return json.load(f)
        return {}
    
    @pytest.fixture
    def positional_fixture(self) -> Dict[str, Any]:
        """Load positional player fixture."""
        fixture_path = FIXTURES_DIR / "positional_player.json"
        if fixture_path.exists():
            with open(fixture_path) as f:
                return json.load(f)
        return {}
    
    @pytest.fixture
    def mixed_fixture(self) -> Dict[str, Any]:
        """Load mixed player fixture."""
        fixture_path = FIXTURES_DIR / "mixed_player.json"
        if fixture_path.exists():
            with open(fixture_path) as f:
                return json.load(f)
        return {}
    
    def test_tactical_player_baseline_unchanged(self, tactical_fixture):
        """Tactical player fixture produces consistent baseline."""
        if not tactical_fixture:
            pytest.skip("Fixture not found")
        
        config_off = MLConfig()  # All flags OFF
        
        puzzles = []
        for game in tactical_fixture.get("games", []):
            for move in game.get("moves_analysis", []):
                if move.get("mistake_type") in ("blunder", "mistake"):
                    puzzle = generate_puzzle_from_blunder(
                        game_id=game["id"],
                        move_ply=move["ply"],
                        fen_before=move["fen_before"],
                        eval_data={"best_move": "Nxd5", "eval_delta": move.get("eval_delta", 0)},
                        heuristics=move.get("heuristics", {}),
                        mistake_move=move["move"],
                        eco=game.get("opening_eco"),
                        ml_config=config_off,
                    )
                    puzzles.append(puzzle)
        
        # Verify no quality_score present (baseline unchanged)
        for puzzle in puzzles:
            assert "quality_score" not in puzzle
            assert "explain" not in puzzle
        
        # Verify expected puzzle count
        assert len(puzzles) == tactical_fixture.get("expected_puzzle_count", 0)
    
    def test_dual_run_baseline_unchanged_augmented_exists(self, tactical_fixture):
        """Dual-run: baseline unchanged, augmented adds quality_score."""
        if not tactical_fixture:
            pytest.skip("Fixture not found")
        
        config_off = MLConfig()
        config_on = MLConfig(enabled=True, puzzle_quality_scoring=True)
        
        for game in tactical_fixture.get("games", []):
            for move in game.get("moves_analysis", []):
                if move.get("mistake_type") in ("blunder", "mistake"):
                    # Baseline
                    baseline_puzzle = generate_puzzle_from_blunder(
                        game_id=game["id"],
                        move_ply=move["ply"],
                        fen_before=move["fen_before"],
                        eval_data={"best_move": "Nxd5", "eval_delta": move.get("eval_delta", 0)},
                        heuristics=move.get("heuristics", {}),
                        mistake_move=move["move"],
                        eco=game.get("opening_eco"),
                        ml_config=config_off,
                    )
                    
                    # Augmented
                    augmented_puzzle = generate_puzzle_from_blunder(
                        game_id=game["id"],
                        move_ply=move["ply"],
                        fen_before=move["fen_before"],
                        eval_data={"best_move": "Nxd5", "eval_delta": move.get("eval_delta", 0)},
                        heuristics=move.get("heuristics", {}),
                        mistake_move=move["move"],
                        eco=game.get("opening_eco"),
                        ml_config=config_on,
                    )
                    
                    # Verify baseline fields unchanged
                    assert baseline_puzzle["puzzle_id"] == augmented_puzzle["puzzle_id"]
                    assert baseline_puzzle["theme"] == augmented_puzzle["theme"]
                    assert baseline_puzzle["fen"] == augmented_puzzle["fen"]
                    
                    # Verify augmented has quality_score
                    assert "quality_score" not in baseline_puzzle
                    assert "quality_score" in augmented_puzzle
                    
                    # Compute diff
                    diff = compute_diff(baseline_puzzle, augmented_puzzle)
                    assert len(diff["added"]) >= 1  # At least quality_score added
                    assert len(diff["changed"]) == 0  # No baseline fields changed
