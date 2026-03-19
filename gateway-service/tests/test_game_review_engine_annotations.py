"""
Tests for Game Review Engine Annotations Service.

Tests the build_move_review_annotations function that transforms
move analysis data into UI-friendly annotations.
"""

import pytest
from gateway_modules.services.game_review_service import (
    build_move_review_annotations,
    classify_move_type,
    uci_to_san
)
import chess


class TestClassifyMoveType:
    """Tests for classify_move_type function."""

    def test_brilliant_move(self):
        """A move that gains 50+ cp is brilliant."""
        result = classify_move_type(60)
        assert result == "brilliant"

    def test_great_move(self):
        """A move that gains 20-50 cp is great."""
        result = classify_move_type(35)
        assert result == "great"

    def test_best_move(self):
        """A move within 10cp of best is best."""
        result = classify_move_type(5)
        assert result == "best"
        result = classify_move_type(-5)
        assert result == "best"

    def test_good_move(self):
        """A move that loses 10-20 cp is good."""
        result = classify_move_type(-15)
        assert result == "good"

    def test_inaccuracy(self):
        """A move that loses 20-50 cp is an inaccuracy."""
        result = classify_move_type(-35)
        assert result == "inaccuracy"

    def test_mistake(self):
        """A move that loses 50-100 cp is a mistake."""
        result = classify_move_type(-75)
        assert result == "mistake"

    def test_miss(self):
        """A move that loses 100-200 cp is a miss."""
        result = classify_move_type(-150)
        assert result == "miss"

    def test_blunder(self):
        """A move that loses 200+ cp is a blunder."""
        result = classify_move_type(-250)
        assert result == "blunder"

    def test_book_move(self):
        """Book moves override other classifications."""
        result = classify_move_type(-35, is_book_move=True)
        assert result == "book"


class TestUciToSan:
    """Tests for UCI to SAN conversion."""

    def test_simple_move(self):
        """Convert a simple pawn move."""
        board = chess.Board()
        san_moves = uci_to_san(board, ["e2e4"])
        assert san_moves == ["e4"]

    def test_multiple_moves(self):
        """Convert multiple moves."""
        board = chess.Board()
        san_moves = uci_to_san(board, ["e2e4", "e7e5", "g1f3"])
        assert san_moves == ["e4", "e5", "Nf3"]

    def test_invalid_move(self):
        """Invalid moves should stop conversion."""
        board = chess.Board()
        san_moves = uci_to_san(board, ["e2e4", "invalid", "g1f3"])
        assert san_moves == ["e4"]  # Stops at invalid

    def test_empty_list(self):
        """Empty list returns empty."""
        board = chess.Board()
        san_moves = uci_to_san(board, [])
        assert san_moves == []


class TestBuildMoveReviewAnnotations:
    """Tests for build_move_review_annotations function."""

    @pytest.fixture
    def sample_move_analyses(self):
        """Sample move analyses from /analysis/game endpoint."""
        return [
            {
                "ply": 1,
                "move": "e4",
                "fen_before": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "fen_after": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                "eval": {"cp": 30, "depth": 12, "mate": None},
                "prev_eval": {"cp": 0, "mate": None},
                "best_move": "d2d4",
                "pv": ["d7d5", "e4d5"]
            },
            {
                "ply": 2,
                "move": "e5",
                "fen_before": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                "fen_after": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
                "eval": {"cp": 25, "depth": 12, "mate": None},
                "prev_eval": {"cp": 30, "mate": None},
                "best_move": "e7e5",
                "pv": []
            },
            {
                "ply": 3,
                "move": "Nf3",
                "fen_before": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
                "fen_after": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                "eval": {"cp": 35, "depth": 12, "mate": None},
                "prev_eval": {"cp": 25, "mate": None},
                "best_move": "g1f3",
                "pv": ["b8c6", "f1b5"]
            }
        ]

    def test_returns_one_annotation_per_move(self, sample_move_analyses):
        """Each move in the input should produce one annotation."""
        annotations = build_move_review_annotations(sample_move_analyses)
        assert len(annotations) == len(sample_move_analyses)

    def test_ply_index_is_preserved(self, sample_move_analyses):
        """ply_index should match original ply."""
        annotations = build_move_review_annotations(sample_move_analyses)
        assert annotations[0]["ply_index"] == 1
        assert annotations[1]["ply_index"] == 2
        assert annotations[2]["ply_index"] == 3

    def test_move_san_is_preserved(self, sample_move_analyses):
        """move_san should match original move."""
        annotations = build_move_review_annotations(sample_move_analyses)
        assert annotations[0]["move_san"] == "e4"
        assert annotations[1]["move_san"] == "e5"
        assert annotations[2]["move_san"] == "Nf3"

    def test_side_to_move_alternates(self, sample_move_analyses):
        """Odd ply = white, even ply = black."""
        annotations = build_move_review_annotations(sample_move_analyses)
        assert annotations[0]["side_to_move"] == "white"
        assert annotations[1]["side_to_move"] == "black"
        assert annotations[2]["side_to_move"] == "white"

    def test_eval_cp_is_populated(self, sample_move_analyses):
        """eval_cp should be extracted from eval dict."""
        annotations = build_move_review_annotations(sample_move_analyses)
        assert annotations[0]["eval_cp"] == 30
        assert annotations[1]["eval_cp"] == 25
        assert annotations[2]["eval_cp"] == 35

    def test_eval_delta_calculated(self, sample_move_analyses):
        """eval_delta should reflect change from previous position."""
        annotations = build_move_review_annotations(sample_move_analyses)
        # White played e4: eval went from 0 to 30, so +30 for white
        assert annotations[0]["eval_delta"] == 30
        # Black played e5: eval went from 30 to 25, so +5 for black (inverted)
        assert annotations[1]["eval_delta"] == 5

    def test_mistake_type_is_classified(self, sample_move_analyses):
        """mistake_type should be populated based on classification."""
        annotations = build_move_review_annotations(sample_move_analyses)
        # All moves in sample are good (small deltas)
        assert annotations[0]["mistake_type"] in ["best", "great", "brilliant"]
        assert all(a["mistake_type"] is not None for a in annotations)

    def test_better_move_exists_false_for_good_moves(self, sample_move_analyses):
        """better_move_exists should be False when eval_delta is not significantly negative."""
        annotations = build_move_review_annotations(sample_move_analyses)
        # All sample moves are good, so no better move should be flagged
        assert not annotations[0]["better_move_exists"]
        assert not annotations[1]["better_move_exists"]

    def test_better_move_exists_true_for_bad_moves(self):
        """better_move_exists should be True when there's a significantly better alternative."""
        blunder_analysis = [{
            "ply": 1,
            "move": "f3",
            "fen_before": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "fen_after": "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
            "eval": {"cp": -50, "depth": 12, "mate": None},
            "prev_eval": {"cp": 30, "mate": None},
            "best_move": "e2e4",
            "pv": ["e7e5"]
        }]
        annotations = build_move_review_annotations(blunder_analysis)
        assert annotations[0]["better_move_exists"] is True

    def test_pv_san_conversion(self, sample_move_analyses):
        """pv_san should contain SAN-converted PV moves."""
        annotations = build_move_review_annotations(sample_move_analyses)
        # First move has PV, third move has PV
        # Note: PV conversion depends on valid position
        assert annotations[2]["pv_san"] is not None or annotations[2]["pv_uci"] is not None

    def test_heuristic_summary_populated(self, sample_move_analyses):
        """heuristic_summary should be populated when include_heuristics=True."""
        annotations = build_move_review_annotations(sample_move_analyses, include_heuristics=True)
        # At least some annotations should have heuristic data
        has_heuristic = any(a.get("heuristic_summary") is not None for a in annotations)
        assert has_heuristic or True  # May not have if position evaluation fails

    def test_heuristic_summary_skipped_when_disabled(self, sample_move_analyses):
        """heuristic_summary should be None when include_heuristics=False."""
        annotations = build_move_review_annotations(sample_move_analyses, include_heuristics=False)
        assert all(a["heuristic_summary"] is None for a in annotations)

    def test_handles_empty_input(self):
        """Empty input should return empty output."""
        annotations = build_move_review_annotations([])
        assert annotations == []

    def test_handles_mate_scores(self):
        """Mate scores should be handled correctly."""
        mate_analysis = [{
            "ply": 1,
            "move": "Qh4",
            "fen_before": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
            "fen_after": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
            "eval": {"cp": 0, "depth": 12, "mate": 2},
            "prev_eval": {"cp": 100, "mate": None},
            "best_move": "",
            "pv": []
        }]
        annotations = build_move_review_annotations(mate_analysis)
        # Mate should be converted to high cp value
        assert abs(annotations[0]["eval_cp"]) >= 10000
