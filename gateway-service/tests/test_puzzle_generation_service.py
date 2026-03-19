"""
Unit tests for puzzle generation service.
"""

import pytest
from gateway_modules.services.puzzle_generation_service import generate_puzzle_from_blunder


class TestPuzzleGeneration:
    """Test cases for puzzle generation."""

    def test_basic_puzzle_generation(self):
        """Test basic puzzle generation from blunder."""
        puzzle = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=15,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3", "depth": 12},
            heuristics={"fork": True, "hanging_piece": False},
            mistake_move="d5"
        )
        
        assert puzzle is not None
        assert puzzle["puzzle_id"] == "pz_123_15"
        assert puzzle["game_id"] == "123"
        assert puzzle["move_ply"] == 15
        assert puzzle["best_move"] == "Nf3"
        assert puzzle["mistake_move"] == "d5"
        assert "fork" in puzzle["theme"]

    def test_theme_extraction(self):
        """Test theme extraction from heuristics."""
        puzzle = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=10,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3"},
            heuristics={
                "fork": True,
                "pin": True,
                "hanging_piece": True,
                "trapped_piece": False
            },
            mistake_move="d5"
        )
        
        assert "fork" in puzzle["theme"]
        assert "pin" in puzzle["theme"]
        assert "hanging_piece" in puzzle["theme"]
        assert "trapped_piece" not in puzzle["theme"]

    def test_default_theme(self):
        """Test that default theme is used when no heuristics match."""
        puzzle = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=10,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3"},
            heuristics={
                "fork": False,
                "pin": False,
                "hanging_piece": False
            },
            mistake_move="d5"
        )
        
        assert len(puzzle["theme"]) > 0
        assert puzzle["theme"][0] == "tactical"  # Default theme

    def test_side_to_move_extraction(self):
        """Test side to move extraction from FEN."""
        # White to move
        puzzle_white = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=10,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3"},
            heuristics={},
            mistake_move="d5"
        )
        assert puzzle_white["side_to_move"] == "white"
        
        # Black to move
        puzzle_black = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=11,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf6"},
            heuristics={},
            mistake_move="e5"
        )
        assert puzzle_black["side_to_move"] == "black"

    def test_weak_line_linking(self):
        """Test linking puzzle to weak line."""
        puzzle = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=10,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3"},
            heuristics={},
            mistake_move="d5",
            weak_line_id="wl_abc123"
        )
        
        assert puzzle["weak_line_id"] == "wl_abc123"

    def test_puzzle_id_format(self):
        """Test that puzzle ID follows expected format."""
        puzzle = generate_puzzle_from_blunder(
            game_id="game_123",
            move_ply=42,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3"},
            heuristics={},
            mistake_move="d5"
        )
        
        assert puzzle["puzzle_id"] == "pz_game_123_42"
        assert puzzle["puzzle_id"].startswith("pz_")

    def test_missing_best_move(self):
        """Test handling of missing best_move in eval_data."""
        puzzle = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=10,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200},  # No best_move
            heuristics={},
            mistake_move="d5"
        )
        
        assert puzzle["best_move"] == ""  # Should default to empty string

    def test_all_required_fields(self):
        """Test that all required fields are present."""
        puzzle = generate_puzzle_from_blunder(
            game_id="123",
            move_ply=10,
            fen_before="rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
            eval_data={"cp": -200, "best_move": "Nf3"},
            heuristics={},
            mistake_move="d5"
        )
        
        required_fields = [
            "puzzle_id", "game_id", "move_ply", "fen",
            "side_to_move", "best_move", "theme", "mistake_move"
        ]
        
        for field in required_fields:
            assert field in puzzle, f"Missing field: {field}"






