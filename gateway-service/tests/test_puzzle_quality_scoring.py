"""
Unit tests for puzzle quality scoring (Step 1).

Tests verify:
- Higher eval_delta increases severity score
- Opening phase applies penalty
- Repeated motifs reduce score
- Explain includes all inputs
- Baseline unchanged when flags OFF
"""

import pytest
from typing import Dict, Any
from collections import defaultdict

from gateway_modules.config.ml_config import MLConfig
from gateway_modules.services.puzzle_quality_scorer import (
    compute_severity_score,
    compute_clarity_score,
    compute_tactical_score,
    compute_phase_penalty,
    compute_redundancy_penalty,
    compute_puzzle_quality,
    PuzzleQualityTracker,
)
from gateway_modules.services.puzzle_generation_service import (
    generate_puzzle_from_blunder,
    extract_themes_from_heuristics,
    detect_phase_from_ply,
)


class TestSeverityScore:
    """Test severity score computation."""
    
    def test_low_delta_low_score(self):
        """100cp should give ~0.2 score."""
        score = compute_severity_score(100)
        assert 0.1 <= score <= 0.3
    
    def test_medium_delta_medium_score(self):
        """200cp should give ~0.5 score."""
        score = compute_severity_score(200)
        assert 0.4 <= score <= 0.6
    
    def test_high_delta_high_score(self):
        """400cp should give ~0.9 score."""
        score = compute_severity_score(400)
        assert 0.8 <= score <= 1.0
    
    def test_very_high_delta_capped(self):
        """>500cp should cap at 1.0."""
        score = compute_severity_score(600)
        assert score <= 1.0
    
    def test_negative_delta_uses_absolute(self):
        """Negative deltas should use absolute value."""
        score_pos = compute_severity_score(200)
        score_neg = compute_severity_score(-200)
        assert score_pos == score_neg
    
    def test_zero_delta_zero_score(self):
        """0cp should give 0 score."""
        score = compute_severity_score(0)
        assert score == 0.0


class TestClarityScore:
    """Test clarity score from MultiPV gap."""
    
    def test_none_returns_default(self):
        """When MultiPV not available, return 0.5."""
        score = compute_clarity_score(None)
        assert score == 0.5
    
    def test_low_gap_low_score(self):
        """Small gap = ambiguous = low score."""
        score = compute_clarity_score(50)
        assert score < 0.3
    
    def test_high_gap_high_score(self):
        """Large gap = clear best move = high score."""
        score = compute_clarity_score(300)
        assert score >= 0.9
    
    def test_gap_capped_at_one(self):
        """Very large gaps cap at 1.0."""
        score = compute_clarity_score(500)
        assert score == 1.0


class TestTacticalScore:
    """Test tactical score from heuristics."""
    
    def test_no_motifs_low_score(self):
        """No tactical motifs = 0.3."""
        heuristics = {"fork": False, "pin": False}
        score = compute_tactical_score(heuristics)
        assert score == 0.3
    
    def test_fork_high_score(self):
        """Fork detected = 1.0."""
        heuristics = {"fork": True, "pin": False}
        score = compute_tactical_score(heuristics)
        assert score == 1.0
    
    def test_multiple_motifs_still_one(self):
        """Multiple motifs still = 1.0."""
        heuristics = {"fork": True, "pin": True, "skewer": True}
        score = compute_tactical_score(heuristics)
        assert score == 1.0


class TestPhasePenalty:
    """Test phase-based penalty."""
    
    def test_opening_penalized(self):
        """Opening phase applies penalty."""
        config = MLConfig(quality_opening_phase_penalty=0.7)
        penalty = compute_phase_penalty("opening", config)
        assert penalty == 0.7
    
    def test_middlegame_no_penalty(self):
        """Middlegame has no penalty."""
        config = MLConfig()
        penalty = compute_phase_penalty("middlegame", config)
        assert penalty == 1.0
    
    def test_endgame_no_penalty(self):
        """Endgame has no penalty."""
        config = MLConfig()
        penalty = compute_phase_penalty("endgame", config)
        assert penalty == 1.0


class TestRedundancyPenalty:
    """Test redundancy penalty for repeated motif+ECO."""
    
    def test_first_occurrence_no_penalty(self):
        """First occurrence has no penalty."""
        counts: Dict[tuple, int] = defaultdict(int)
        penalty = compute_redundancy_penalty("B20", ["fork"], counts)
        assert penalty == 1.0
    
    def test_multiple_occurrences_penalized(self):
        """Third occurrence of same motif+ECO is penalized."""
        config = MLConfig(
            quality_redundancy_penalty_threshold=3,
            quality_redundancy_penalty_factor=0.8
        )
        counts = {("fork", "B20"): 3}
        penalty = compute_redundancy_penalty("B20", ["fork"], counts, config)
        assert penalty < 1.0
    
    def test_penalty_compounds(self):
        """More occurrences = more penalty."""
        config = MLConfig(
            quality_redundancy_penalty_threshold=3,
            quality_redundancy_penalty_factor=0.8
        )
        counts_3 = {("fork", "B20"): 3}
        counts_5 = {("fork", "B20"): 5}
        penalty_3 = compute_redundancy_penalty("B20", ["fork"], counts_3, config)
        penalty_5 = compute_redundancy_penalty("B20", ["fork"], counts_5, config)
        assert penalty_5 < penalty_3


class TestComputePuzzleQuality:
    """Test full quality scoring pipeline."""
    
    def test_high_quality_puzzle(self):
        """Puzzle with high severity, tactical motif gets high score."""
        config = MLConfig()
        puzzle = {
            "puzzle_id": "pz_test_1",
            "theme": ["fork"],
            "eco": "B20",
        }
        heuristics = {"fork": True}
        counts: Dict[tuple, int] = defaultdict(int)
        
        score, components, explain = compute_puzzle_quality(
            puzzle=puzzle,
            eval_delta=300,
            heuristics=heuristics,
            phase="middlegame",
            motif_eco_counts=counts,
            ml_config=config,
        )
        
        assert score >= 0.6
        assert components["severity"] >= 0.5
        assert components["tactical_signal"] == 1.0
        assert explain.final_score == score
    
    def test_low_quality_opening_puzzle(self):
        """Opening puzzle with low severity gets low score."""
        config = MLConfig()
        puzzle = {
            "puzzle_id": "pz_test_2",
            "theme": ["tactical"],
            "eco": "C50",
        }
        heuristics = {}
        counts: Dict[tuple, int] = defaultdict(int)
        
        score, components, explain = compute_puzzle_quality(
            puzzle=puzzle,
            eval_delta=100,
            heuristics=heuristics,
            phase="opening",
            motif_eco_counts=counts,
            ml_config=config,
        )
        
        assert score < 0.5
        assert components["phase_penalty"] == 0.7
        assert "opening" in explain.rationale.lower()
    
    def test_explain_includes_all_inputs(self):
        """Explain object contains all required inputs."""
        config = MLConfig()
        puzzle = {"puzzle_id": "pz_test_3", "theme": ["pin"], "eco": "D00"}
        
        score, components, explain = compute_puzzle_quality(
            puzzle=puzzle,
            eval_delta=250,
            heuristics={"pin": True},
            phase="middlegame",
            motif_eco_counts={},
            multipv_gap_cp=200,
            ml_config=config,
        )
        
        assert "eval_delta" in explain.inputs_used
        assert explain.inputs_used["eval_delta"] == 250
        assert "multipv_gap_cp" in explain.inputs_used
        assert explain.inputs_used["multipv_gap_cp"] == 200
        assert explain.inputs_used["phase"] == "middlegame"
        assert "severity" in explain.scoring_rules


class TestPuzzleQualityTracker:
    """Test bulk puzzle tracking."""
    
    def test_tracks_all_puzzles(self):
        """Tracker stores all scored puzzles."""
        config = MLConfig()
        tracker = PuzzleQualityTracker(config)
        
        for i in range(5):
            puzzle = {"puzzle_id": f"pz_{i}", "theme": ["fork"], "eco": "B20"}
            tracker.score_puzzle(puzzle, 200 + i * 50, {"fork": True}, "middlegame")
        
        assert len(tracker.puzzles) == 5
        assert len(tracker.quality_scores) == 5
    
    def test_redundancy_tracking(self):
        """Later puzzles with same motif+ECO get lower scores."""
        config = MLConfig(
            quality_redundancy_penalty_threshold=2,
            quality_redundancy_penalty_factor=0.8
        )
        tracker = PuzzleQualityTracker(config)
        
        # Add 4 puzzles with same motif+ECO
        scores = []
        for i in range(4):
            puzzle = {"puzzle_id": f"pz_{i}", "theme": ["fork"], "eco": "B20"}
            result = tracker.score_puzzle(puzzle, 200, {"fork": True}, "middlegame")
            scores.append(result["quality_score"])
        
        # Later puzzles should have lower scores
        assert scores[0] >= scores[2]
        assert scores[2] >= scores[3]
    
    def test_get_summary(self):
        """Summary includes expected fields."""
        config = MLConfig()
        tracker = PuzzleQualityTracker(config)
        
        tracker.score_puzzle({"puzzle_id": "p1", "theme": ["fork"], "eco": "B20"}, 300, {"fork": True}, "middlegame")
        tracker.score_puzzle({"puzzle_id": "p2", "theme": ["pin"], "eco": "C50"}, 200, {"pin": True}, "middlegame")
        
        summary = tracker.get_summary()
        
        assert summary["total_candidates"] == 2
        assert "mean_score" in summary
        assert "top_motifs" in summary
        assert "score_distribution" in summary


class TestGeneratePuzzleFromBlunder:
    """Test puzzle generation with/without ML config."""
    
    def test_baseline_unchanged_without_config(self):
        """Without ml_config, puzzle has no quality_score."""
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=20,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "eval_delta": -200},
            heuristics={"fork": True},
            mistake_move="d5",
            eco="B20",
        )
        
        assert "puzzle_id" in puzzle
        assert "quality_score" not in puzzle
        assert "explain" not in puzzle
    
    def test_baseline_unchanged_with_flag_off(self):
        """With ml_config but puzzle_quality_scoring=False, no quality_score."""
        config = MLConfig(enabled=True, puzzle_quality_scoring=False)
        
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=20,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "eval_delta": -200},
            heuristics={"fork": True},
            mistake_move="d5",
            eco="B20",
            ml_config=config,
        )
        
        assert "puzzle_id" in puzzle
        assert "quality_score" not in puzzle
    
    def test_quality_scoring_with_flag_on(self):
        """With puzzle_quality_scoring=True, puzzle has quality_score."""
        config = MLConfig(enabled=True, puzzle_quality_scoring=True)
        
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=30,
            fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            eval_data={"best_move": "e5", "eval_delta": -200},
            heuristics={"fork": True},
            mistake_move="d5",
            eco="B20",
            ml_config=config,
        )
        
        assert "quality_score" in puzzle
        assert "quality_components" in puzzle
        assert "explain" in puzzle
        assert 0.0 <= puzzle["quality_score"] <= 1.0


class TestPhaseDetection:
    """Test phase detection from ply."""
    
    def test_opening_phase(self):
        assert detect_phase_from_ply(10) == "opening"
        assert detect_phase_from_ply(20) == "opening"
    
    def test_middlegame_phase(self):
        assert detect_phase_from_ply(30) == "middlegame"
        assert detect_phase_from_ply(60) == "middlegame"
    
    def test_endgame_phase(self):
        assert detect_phase_from_ply(70) == "endgame"
        assert detect_phase_from_ply(100) == "endgame"


class TestThemeExtraction:
    """Test theme extraction from heuristics."""
    
    def test_extracts_fork(self):
        themes = extract_themes_from_heuristics({"fork": True, "pin": False})
        assert "fork" in themes
        assert "pin" not in themes
    
    def test_multiple_themes(self):
        themes = extract_themes_from_heuristics({"fork": True, "pin": True, "skewer": True})
        assert len(themes) == 3
        assert "fork" in themes
        assert "pin" in themes
    
    def test_default_tactical(self):
        themes = extract_themes_from_heuristics({})
        assert themes == ["tactical"]
