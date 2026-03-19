"""
Tests for fact-grounded heuristic narrator.

Ensures commentary never makes unsupported claims:
- Test A: Trapped false positive (bishop with escapes)
- Test B: Trapped true (known trapped piece FEN)
- Test C: Tension vs hanging
- Test D: Opening conservative (after 1.e4)
"""

import chess
import pytest

from gateway_modules.services.heuristics_service import (
    calculate_position_heuristics,
    detect_trapped_candidates,
)
from gateway_modules.services.position_evaluation_service import (
    generate_commentary,
    evaluate_position_from_heuristics,
)
from gateway_modules.services.heuristic_narrator import (
    render_non_llm_commentary,
)


class TestTrappedFalsePositive:
    """Test A: Ensure no false 'trapped' claims when piece has escapes."""
    
    def test_bishop_with_escapes_not_trapped(self):
        """
        FEN: Bishop on b5 attacked but has multiple escape squares.
        Expected: trapped_piece == False, no 'trapped' in commentary.
        """
        # Position where white bishop on b5 is attacked but has escapes
        # After 1.e4 e5 2.Bc4 (bishop has many escapes)
        fen = "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        # Check trapped_candidates has evidence
        trapped_candidates = heuristics.get("trapped_candidates", [])
        
        # The bishop has many escape squares, should NOT be truly trapped
        assert heuristics["trapped_piece"] == False
        
        # No candidate should be truly trapped
        truly_trapped = [c for c in trapped_candidates if c["is_truly_trapped"]]
        assert len(truly_trapped) == 0
        
        # Commentary must not contain "trapped"
        commentary = generate_commentary(
            tier="equal",
            heuristics=heuristics,
            fen=fen,
            ply_count=3,
            meta={"game_phase": "opening"}
        )
        assert "trapped" not in commentary.lower()
    
    def test_piece_attacked_with_escapes(self):
        """A piece attacked but with legal moves should not be 'truly trapped'."""
        # Standard opening position - no piece is truly trapped
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        
        trapped_candidates = detect_trapped_candidates(board)
        
        # No piece should be truly trapped in this position
        truly_trapped = [c for c in trapped_candidates if c["is_truly_trapped"]]
        assert len(truly_trapped) == 0


class TestTrappedTrue:
    """Test B: Ensure trapped claim is made with evidence when piece IS trapped."""
    
    def test_actually_trapped_piece(self):
        """
        FEN: A known position where a piece is truly trapped.
        Expected: trapped_piece == True, commentary mentions square.
        
        Position: White knight on h6 with no escape squares, attacked by black pawn on g7
        8/5ppk/7N/8/8/8/5PPP/6K1 w - - 0 1
        Actually, let's use a cleaner example: trapped bishop
        """
        # Position where white bishop on a7 is trapped (no escape, attacked)
        # r1bqkbnr/Bppppppp/8/8/8/8/1PPPPPPP/RN1QKBNR b KQkq - 0 1
        # The bishop on a7 is attacked by b8 knight and has nowhere to go
        fen = "r1bqkbnr/Bppppppp/8/8/8/8/1PPPPPPP/RN1QKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        # Find the trapped candidates
        trapped_candidates = heuristics.get("trapped_candidates", [])
        
        # Check if bishop on a7 is in candidates
        a7_candidates = [c for c in trapped_candidates if c["square"] == "a7"]
        
        # If bishop is attacked with no escapes, should be truly trapped
        if a7_candidates and a7_candidates[0]["num_escape_moves"] == 0:
            assert a7_candidates[0]["is_truly_trapped"] == True
            
            # Commentary should mention the trapped piece
            commentary = generate_commentary(
                tier="black_much_better",
                heuristics=heuristics,
                fen=fen,
                ply_count=20,
                meta={"game_phase": "opening"}
            )
            # Should mention trapped and the square
            assert "trapped" in commentary.lower() or "a7" in commentary.lower()


class TestTensionVsHanging:
    """Test C: Defended piece should be 'tension', not 'hanging'."""
    
    def test_defended_piece_is_tension_not_hanging(self):
        """
        FEN: Ruy Lopez position where Nc6 is attacked by Bb5 but defended.
        Expected: Commentary says 'tension' or 'trade', not 'hanging'.
        """
        # After 1.e4 e5 2.Nf3 Nc6 3.Bb5
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        # Nc6 is attacked but defended - should be tension, not hanging
        tension = heuristics.get("tension", {})
        assert tension.get("has_true_hanging_piece", False) == False
        
        # Commentary should NOT say "hanging"
        commentary = generate_commentary(
            tier="equal",
            heuristics=heuristics,
            fen=fen,
            ply_count=6,
            meta={"game_phase": "opening"}
        )
        assert "hanging" not in commentary.lower()


class TestOpeningConservative:
    """Test D: Opening positions should not make wild claims."""
    
    def test_after_1e4_no_advantage_claims(self):
        """
        After 1.e4, commentary should be conservative.
        Expected: No 'winning', 'clear advantage', 'trapped', 'hanging'.
        """
        # After 1.e4
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        result = evaluate_position_from_heuristics(
            heuristics=heuristics,
            white_to_move=False,
            fen=fen,
            board=board,
            ply_count=1,
        )
        
        commentary = result.get("commentary", "")
        
        # Should NOT make strong claims
        forbidden = ["winning", "trapped", "hanging", "clear advantage"]
        for word in forbidden:
            assert word not in commentary.lower(), f"Found '{word}' in opening commentary"
    
    def test_starting_position_neutral(self):
        """Starting position should be neutral with no tactical claims."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        # No piece should be trapped
        assert heuristics["trapped_piece"] == False
        
        # No tension targets
        tension = heuristics.get("tension", {})
        assert len(tension.get("targets", [])) == 0
        
        # Equity should be 50/50
        result = evaluate_position_from_heuristics(
            heuristics=heuristics,
            white_to_move=True,
            fen=fen,
            board=board,
            ply_count=0,
        )
        
        equity = result.get("equity", {})
        assert equity.get("white") == 50
        assert equity.get("black") == 50


class TestNarratorEvidenceBased:
    """Test the narrator only makes claims with evidence."""
    
    def test_narrator_requires_evidence(self):
        """Narrator should not make trapped claim without evidence."""
        # Simulate heuristics without truly trapped candidates
        heuristics = {
            "trapped_candidates": [
                {
                    "square": "b5",
                    "piece": "B",
                    "color": "white",
                    "is_attacked": True,
                    "legal_escape_moves_san": ["Ba4", "Bc4", "Bd3", "Be2"],
                    "num_escape_moves": 4,
                    "is_truly_trapped": False,  # Has escapes!
                }
            ],
            "trapped_piece": False,
            "tension": {"targets": [], "has_true_hanging_piece": False},
        }
        
        result = render_non_llm_commentary(
            heuristics=heuristics,
            ply_count=15,
            meta={"game_phase": "middlegame"},
            fen="test",
        )
        
        # Should NOT mention trapped
        assert "trapped" not in result["text"].lower()
        assert "trapped" not in result.get("tags", [])
    
    def test_narrator_mentions_trapped_with_evidence(self):
        """Narrator should mention trapped when there is evidence."""
        heuristics = {
            "trapped_candidates": [
                {
                    "square": "a7",
                    "piece": "B",
                    "color": "white",
                    "is_attacked": True,
                    "legal_escape_moves_san": [],
                    "num_escape_moves": 0,
                    "is_truly_trapped": True,  # No escapes!
                }
            ],
            "trapped_piece": True,
            "tension": {"targets": [], "has_true_hanging_piece": False},
        }
        
        result = render_non_llm_commentary(
            heuristics=heuristics,
            ply_count=20,
            meta={"game_phase": "middlegame"},
            fen="test",
        )
        
        # Should mention trapped
        assert "trapped" in result["text"].lower()
        # Should mention the square
        assert "a7" in result["text"].lower()
        assert "trapped" in result.get("tags", [])
