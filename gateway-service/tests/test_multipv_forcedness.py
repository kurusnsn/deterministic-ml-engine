"""
Unit tests for MultiPV forcedness filter (Step 2).

Tests verify:
- Gap computation is correct
- Soft mode applies penalty to quality_score
- Hard mode marks puzzles for filtering
- is_forced threshold is respected
- Explain includes all required fields
"""

import pytest
from typing import Dict, Any
from unittest.mock import patch, AsyncMock

from gateway_modules.config.ml_config import MLConfig
from gateway_modules.services.multipv_forcedness_service import (
    compute_forcedness_penalty,
    apply_forcedness_filter,
    _parse_score_to_cp,
    _parse_score_to_mate,
    _empty_result,
)
from gateway_modules.services.puzzle_generation_service import generate_puzzle_from_blunder


class TestGapComputation:
    """Test MultiPV gap parsing and computation."""
    
    def test_parse_cp_from_int(self):
        """Integer score returns cp directly."""
        assert _parse_score_to_cp(150) == 150
        assert _parse_score_to_cp(-200) == -200
    
    def test_parse_cp_from_float(self):
        """Float score is converted to int."""
        assert _parse_score_to_cp(150.5) == 150
    
    def test_parse_cp_from_mate_string(self):
        """Mate string returns ±10000."""
        assert _parse_score_to_cp("mate 3") == 10000
        assert _parse_score_to_cp("mate -5") == -10000
    
    def test_parse_mate_distance(self):
        """Mate distance is extracted correctly."""
        assert _parse_score_to_mate("mate 3") == 3
        assert _parse_score_to_mate("mate -5") == -5
        assert _parse_score_to_mate(150) is None
    
    def test_empty_result_structure(self):
        """Empty result has required keys."""
        result = _empty_result()
        assert "cp" in result
        assert "multipv_lines" in result
        assert "multipv_gap_cp" in result
        assert "is_forced" in result
        assert result["is_forced"] is False


class TestForcednessComputation:
    """Test forcedness penalty calculation."""
    
    def test_forced_move_no_penalty(self):
        """Forced move (gap >= threshold) gets no penalty."""
        penalty, explain = compute_forcedness_penalty(
            is_forced=True,
            multipv_gap_cp=200,
            forcedness_mode="soft",
            soft_penalty=0.6,
        )
        
        assert penalty == 1.0
        assert explain.is_forced is True
        assert "forced" in explain.rationale.lower()
    
    def test_unforced_soft_mode_penalty(self):
        """Unforced move in soft mode gets reduced quality."""
        penalty, explain = compute_forcedness_penalty(
            is_forced=False,
            multipv_gap_cp=50,
            forcedness_mode="soft",
            soft_penalty=0.6,
        )
        
        assert penalty == 0.6
        assert explain.is_forced is False
        assert "SOFT" in explain.rationale
    
    def test_unforced_hard_mode_discard(self):
        """Unforced move in hard mode gets penalty=0 (discard)."""
        penalty, explain = compute_forcedness_penalty(
            is_forced=False,
            multipv_gap_cp=50,
            forcedness_mode="hard",
            soft_penalty=0.6,
        )
        
        assert penalty == 0.0
        assert explain.is_forced is False
        assert "HARD" in explain.rationale
        assert "discarded" in explain.rationale.lower()
    
    def test_explain_includes_inputs(self):
        """Explain includes all input values."""
        penalty, explain = compute_forcedness_penalty(
            is_forced=False,
            multipv_gap_cp=100,
            forcedness_mode="soft",
        )
        
        assert explain.inputs_used["multipv_gap_cp"] == 100
        assert explain.inputs_used["is_forced"] is False
        assert explain.forcedness_mode == "soft"


class TestApplyForcednessFilter:
    """Test applying filter to puzzles."""
    
    def test_soft_mode_reduces_quality_score(self):
        """Soft mode reduces quality_score for unforced puzzles."""
        config = MLConfig(
            enabled=True,
            multipv_forcedness_filter=True,
            forcedness_mode="soft",
            forcedness_soft_penalty=0.6,
        )
        
        puzzle = {"puzzle_id": "pz_1", "quality_score": 0.8}
        eval_data = {"multipv_gap_cp": 50, "is_forced": False}
        
        should_keep, updated = apply_forcedness_filter(puzzle, eval_data, config)
        
        assert should_keep is True
        assert updated["quality_score"] == pytest.approx(0.8 * 0.6, rel=0.01)
        assert updated["is_forced"] is False
    
    def test_hard_mode_marks_for_filter(self):
        """Hard mode marks unforced puzzles for filtering."""
        config = MLConfig(
            enabled=True,
            multipv_forcedness_filter=True,
            forcedness_mode="hard",
        )
        
        puzzle = {"puzzle_id": "pz_1", "quality_score": 0.8}
        eval_data = {"multipv_gap_cp": 50, "is_forced": False}
        
        should_keep, updated = apply_forcedness_filter(puzzle, eval_data, config)
        
        assert should_keep is False
        assert updated["is_forced"] is False
    
    def test_forced_puzzle_unchanged(self):
        """Forced puzzle passes without penalty."""
        config = MLConfig(
            enabled=True,
            multipv_forcedness_filter=True,
            forcedness_mode="soft",
        )
        
        puzzle = {"puzzle_id": "pz_1", "quality_score": 0.8}
        eval_data = {"multipv_gap_cp": 200, "is_forced": True}
        
        should_keep, updated = apply_forcedness_filter(puzzle, eval_data, config)
        
        assert should_keep is True
        assert updated["quality_score"] == 0.8  # Unchanged
        assert updated["is_forced"] is True


class TestPuzzleGenerationWithForcedness:
    """Test puzzle generation with forcedness filter enabled."""
    
    def test_baseline_unchanged_without_config(self):
        """Without ml_config, no forcedness data added."""
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=30,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "multipv_gap_cp": 200, "is_forced": True},
            heuristics={"fork": True},
            mistake_move="d5",
        )
        
        assert "is_forced" not in puzzle
        assert "forcedness_explain" not in puzzle
    
    def test_forcedness_disabled_no_filter(self):
        """With forcedness OFF, no forcedness data added."""
        config = MLConfig(enabled=True, multipv_forcedness_filter=False)
        
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=30,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "multipv_gap_cp": 200, "is_forced": True},
            heuristics={"fork": True},
            mistake_move="d5",
            ml_config=config,
        )
        
        assert "forcedness_explain" not in puzzle
    
    def test_forcedness_enabled_adds_data(self):
        """With forcedness ON, adds is_forced and explain."""
        config = MLConfig(
            enabled=True,
            multipv_forcedness_filter=True,
            forcedness_mode="soft",
        )
        
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=30,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "multipv_gap_cp": 200, "is_forced": True},
            heuristics={"fork": True},
            mistake_move="d5",
            ml_config=config,
        )
        
        assert "is_forced" in puzzle
        assert puzzle["is_forced"] is True
        assert "forcedness_explain" in puzzle
        assert "multipv_gap_cp" in puzzle
    
    def test_hard_mode_marks_filtered(self):
        """Hard mode with unforced move marks puzzle for filtering."""
        config = MLConfig(
            enabled=True,
            multipv_forcedness_filter=True,
            forcedness_mode="hard",
        )
        
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=30,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "multipv_gap_cp": 50, "is_forced": False},
            heuristics={"fork": True},
            mistake_move="d5",
            ml_config=config,
        )
        
        assert puzzle.get("_filtered_by_forcedness") is True


class TestThresholdConfiguration:
    """Test threshold configuration."""
    
    def test_custom_threshold(self):
        """Custom threshold applies correctly."""
        config = MLConfig(
            enabled=True,
            multipv_forcedness_filter=True,
            forced_threshold_cp=100,  # Lower threshold
        )
        
        # With default 150, 120cp would be unforced
        # With custom 100, 120cp should be forced
        puzzle = {"puzzle_id": "pz_1", "quality_score": 0.8}
        eval_data = {"multipv_gap_cp": 120, "is_forced": True}  # Should be forced with 100 threshold
        
        should_keep, updated = apply_forcedness_filter(puzzle, eval_data, config)
        
        assert should_keep is True
        # Quality score unchanged for forced moves
        assert updated["quality_score"] == 0.8
