"""
Unit tests for highlight extraction service.
"""

import pytest
from gateway_modules.services.highlight_extraction_service import (
    extract_highlights,
    _detect_brilliant_moves,
    _detect_comeback_wins,
    _detect_epic_saves,
    _detect_perfect_openings,
    _detect_tactical_sequences,
    _get_motifs_from_heuristics
)


class TestHighlightExtraction:
    """Test cases for highlight extraction."""

    def test_extract_highlights_empty_moves(self):
        """Test that empty moves returns empty highlights."""
        result = extract_highlights([], {})
        assert result == []

    def test_extract_highlights_none_moves(self):
        """Test that None moves returns empty highlights."""
        result = extract_highlights(None, {})
        assert result == []

    def test_get_motifs_from_heuristics(self):
        """Test motif extraction from heuristics dict."""
        heuristics = {
            "fork": True,
            "pin": False,
            "skewer": True,
            "xray": False,
            "hanging_piece": True
        }
        motifs = _get_motifs_from_heuristics(heuristics)
        assert "fork" in motifs
        assert "skewer" in motifs
        assert "hanging_piece" in motifs
        assert "pin" not in motifs

    def test_get_motifs_from_empty_heuristics(self):
        """Test motif extraction from empty heuristics."""
        assert _get_motifs_from_heuristics({}) == []
        assert _get_motifs_from_heuristics(None) == []


class TestBrilliantMoveDetection:
    """Test cases for brilliant move detection."""

    def test_brilliant_move_detected(self):
        """Test that brilliant move is detected with correct conditions."""
        moves = [{
            "game_id": "game1",
            "ply": 15,
            "move": "Nxd5",
            "best_move": "Nxd5",
            "eval_delta": 200,
            "eval": {"cp": 250},
            "fen_before": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "eco": "B50",
            "heuristics": {
                "fork": True,
                "pin": False
            }
        }]
        
        result = _detect_brilliant_moves(moves, {})
        
        assert len(result) == 1
        assert result[0]["type"] == "brilliant"
        assert result[0]["game_id"] == "game1"
        assert result[0]["ply"] == 15
        assert result[0]["move"] == "Nxd5"
        assert "fork" in result[0]["motifs"]
        assert "brilliancy" in result[0]["description"]

    def test_brilliant_move_not_best(self):
        """Test that non-best move is not detected as brilliant."""
        moves = [{
            "game_id": "game1",
            "ply": 15,
            "move": "Nxd5",
            "best_move": "Qxe4",  # Different from played move
            "eval_delta": 200,
            "heuristics": {"fork": True}
        }]
        
        result = _detect_brilliant_moves(moves, {})
        assert len(result) == 0

    def test_brilliant_move_no_motif(self):
        """Test that move without tactical motif is not brilliant."""
        moves = [{
            "game_id": "game1",
            "ply": 15,
            "move": "Nxd5",
            "best_move": "Nxd5",
            "eval_delta": 200,
            "heuristics": {"fork": False, "pin": False}
        }]
        
        result = _detect_brilliant_moves(moves, {})
        assert len(result) == 0

    def test_brilliant_move_low_gain(self):
        """Test that move with low cp gain is not brilliant."""
        moves = [{
            "game_id": "game1",
            "ply": 15,
            "move": "Nxd5",
            "best_move": "Nxd5",
            "eval_delta": 100,  # Below 150 threshold
            "heuristics": {"fork": True}
        }]
        
        result = _detect_brilliant_moves(moves, {})
        assert len(result) == 0


class TestComebackWinDetection:
    """Test cases for comeback win detection."""

    def test_comeback_detected(self):
        """Test that comeback win is detected when conditions are met."""
        moves = [
            {"game_id": "game1", "ply": 1, "eval": {"cp": 0}, "eval_delta": 0, 
             "move": "e4", "best_move": "e4", "heuristics": {}},
            {"game_id": "game1", "ply": 5, "eval": {"cp": -250}, "eval_delta": -250,
             "move": "Qh5", "best_move": "d4", "heuristics": {}},
            {"game_id": "game1", "ply": 15, "eval": {"cp": 50}, "eval_delta": 300,
             "move": "Nc4", "best_move": "Nc4", "heuristics": {"fork": True}},
            {"game_id": "game1", "ply": 25, "eval": {"cp": 300}, "eval_delta": 100,
             "move": "Qxf7", "best_move": "Qxf7", "heuristics": {"hanging_piece": True}},
        ]
        
        result = _detect_comeback_wins(moves, {}, {})
        
        assert len(result) == 1
        assert result[0]["type"] == "comeback"
        assert result[0]["ply"] == 15  # Turnaround move
        assert "turned the game around" in result[0]["description"]

    def test_no_comeback_when_not_losing(self):
        """Test that no comeback is detected when never losing."""
        moves = [
            {"game_id": "game1", "ply": 1, "eval": {"cp": 0}, "eval_delta": 0,
             "move": "e4", "best_move": "e4", "heuristics": {}},
            {"game_id": "game1", "ply": 5, "eval": {"cp": -100}, "eval_delta": -100,
             "move": "d4", "best_move": "d4", "heuristics": {}},  # Not losing enough
            {"game_id": "game1", "ply": 15, "eval": {"cp": 200}, "eval_delta": 100,
             "move": "Nc4", "best_move": "Nc4", "heuristics": {}},
        ]
        
        result = _detect_comeback_wins(moves, {}, {})
        assert len(result) == 0


class TestEpicSaveDetection:
    """Test cases for epic save detection."""

    def test_epic_save_detected(self):
        """Test that epic save is detected with correct conditions."""
        moves = [{
            "game_id": "game1",
            "ply": 20,
            "move": "Qf2",
            "best_move": "Qf2",
            "eval": {"cp": -50},
            "eval_delta": 300,  # Was -350, now -50
            "heuristics": {},
            "fen_before": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        }]
        
        result = _detect_epic_saves(moves, {})
        
        assert len(result) == 1
        assert result[0]["type"] == "save"
        assert "neutralized" in result[0]["description"]

    def test_no_save_when_not_severe(self):
        """Test that no save is detected when not in severe position."""
        moves = [{
            "game_id": "game1",
            "ply": 20,
            "move": "Qf2",
            "best_move": "Qf2",
            "eval": {"cp": -50},
            "eval_delta": 100,  # Was only -150, not severe enough
            "heuristics": {}
        }]
        
        result = _detect_epic_saves(moves, {})
        assert len(result) == 0


class TestPerfectOpeningDetection:
    """Test cases for perfect opening detection."""

    def test_perfect_opening_detected(self):
        """Test that perfect opening is detected with 80%+ best moves."""
        moves = [
            {"game_id": "game1", "ply": 1, "move": "e4", "best_move": "e4", 
             "eval": {"cp": 10}, "heuristics": {}, "eco": "B20"},
            {"game_id": "game1", "ply": 3, "move": "Nf3", "best_move": "Nf3",
             "eval": {"cp": 15}, "heuristics": {}, "eco": "B20"},
            {"game_id": "game1", "ply": 5, "move": "Bb5", "best_move": "Bb5",
             "eval": {"cp": 20}, "heuristics": {}, "eco": "B20"},
            {"game_id": "game1", "ply": 7, "move": "O-O", "best_move": "O-O",
             "eval": {"cp": 25}, "heuristics": {}, "eco": "B20"},
            {"game_id": "game1", "ply": 9, "move": "Re1", "best_move": "d4",  # One non-best
             "eval": {"cp": 20}, "heuristics": {}, "eco": "B20"},
        ]
        
        result = _detect_perfect_openings(moves, {})
        
        assert len(result) == 1
        assert result[0]["type"] == "perfect_opening"
        assert result[0]["eco"] == "B20"
        assert "flawless opening" in result[0]["description"]

    def test_no_perfect_opening_when_low_accuracy(self):
        """Test that no perfect opening when accuracy below 80%."""
        moves = [
            {"game_id": "game1", "ply": 1, "move": "e4", "best_move": "e4",
             "eval": {"cp": 10}, "heuristics": {}},
            {"game_id": "game1", "ply": 3, "move": "Nf3", "best_move": "d4",  # Not best
             "eval": {"cp": 15}, "heuristics": {}},
            {"game_id": "game1", "ply": 5, "move": "Bb5", "best_move": "Bc4",  # Not best
             "eval": {"cp": 20}, "heuristics": {}},
        ]
        
        result = _detect_perfect_openings(moves, {})
        assert len(result) == 0


class TestTacticalSequenceDetection:
    """Test cases for tactical sequence detection."""

    def test_tactical_sequence_detected(self):
        """Test that tactical sequence of 3+ moves is detected."""
        moves = [
            {"game_id": "game1", "ply": 15, "move": "Nxe5", "best_move": "Nxe5",
             "eval_delta": 50, "heuristics": {"hanging_piece": True}},
            {"game_id": "game1", "ply": 17, "move": "Bxh7", "best_move": "Bxh7",
             "eval_delta": 40, "heuristics": {"discovered_attack": True}},
            {"game_id": "game1", "ply": 19, "move": "Qh5", "best_move": "Qh5",
             "eval_delta": 60, "heuristics": {"xray": True}},
        ]
        
        result = _detect_tactical_sequences(moves, {})
        
        assert len(result) == 1
        assert result[0]["type"] == "tactical_sequence"
        assert "3-move tactical sequence" in result[0]["description"]

    def test_no_sequence_when_too_short(self):
        """Test that sequence of less than 3 moves is not detected."""
        moves = [
            {"game_id": "game1", "ply": 15, "move": "Nxe5", "best_move": "Nxe5",
             "eval_delta": 50, "heuristics": {}},
            {"game_id": "game1", "ply": 17, "move": "Bxh7", "best_move": "Bxh7",
             "eval_delta": 50, "heuristics": {}},
        ]
        
        result = _detect_tactical_sequences(moves, {})
        assert len(result) == 0


class TestPuzzleLinking:
    """Test cases for puzzle linking to highlights."""

    def test_highlights_include_related_puzzles(self):
        """Test that highlights include related puzzles from the same ECO."""
        moves = [{
            "game_id": "game1",
            "ply": 15,
            "move": "Nxd5",
            "best_move": "Nxd5",
            "eval_delta": 200,
            "eval": {"cp": 250},
            "fen_before": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "eco": "B50",
            "heuristics": {"fork": True}
        }]
        
        report = {
            "generated_puzzles": [
                {"puzzle_id": "pz_1", "eco": "B50"},
                {"puzzle_id": "pz_2", "eco": "B50"},
                {"puzzle_id": "pz_3", "eco": "C20"},  # Different ECO
            ]
        }
        
        result = extract_highlights(moves, report)
        
        assert len(result) == 1
        assert "pz_1" in result[0]["related_puzzles"]
        assert "pz_2" in result[0]["related_puzzles"]
        assert "pz_3" not in result[0]["related_puzzles"]
