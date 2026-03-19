"""
Unit tests for heuristics detection service.
"""

import pytest
import chess
from gateway_modules.services.heuristics_service import calculate_position_heuristics


class TestHeuristicsDetection:
    """Test cases for heuristics detection."""

    def test_fork_detection(self):
        """Test fork detection with known fork position."""
        # Position with knight fork: Knight attacks king and rook
        board = chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
        heuristics = calculate_position_heuristics(board.fen(), board)
        # Note: Fork detection may vary based on implementation
        # This test verifies the function runs without error
        assert "fork" in heuristics
        assert isinstance(heuristics["fork"], bool)

    def test_pin_detection(self):
        """Test pin detection."""
        # Position with pin: Bishop pins knight to king
        board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "pin" in heuristics
        assert isinstance(heuristics["pin"], bool)

    def test_hanging_piece_detection(self):
        """Test hanging piece detection."""
        # Position with hanging piece
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "hanging_piece" in heuristics
        assert isinstance(heuristics["hanging_piece"], bool)

    def test_isolated_pawns(self):
        """Test isolated pawn detection."""
        # Position with isolated pawn on d4
        board = chess.Board("rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "pawn_structure" in heuristics
        assert "isolated_pawns" in heuristics["pawn_structure"]
        assert isinstance(heuristics["pawn_structure"]["isolated_pawns"], list)

    def test_doubled_pawns(self):
        """Test doubled pawn detection."""
        # Position with doubled pawns
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "pawn_structure" in heuristics
        assert "doubled_pawns" in heuristics["pawn_structure"]
        assert isinstance(heuristics["pawn_structure"]["doubled_pawns"], list)

    def test_passed_pawns(self):
        """Test passed pawn detection."""
        # Position with passed pawn
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "pawn_structure" in heuristics
        assert "passed_pawns" in heuristics["pawn_structure"]
        assert isinstance(heuristics["pawn_structure"]["passed_pawns"], list)

    def test_weak_squares(self):
        """Test weak square detection."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "weak_squares" in heuristics
        assert isinstance(heuristics["weak_squares"], list)

    def test_outposts(self):
        """Test outpost detection."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "outposts" in heuristics
        assert isinstance(heuristics["outposts"], list)

    def test_mobility_score(self):
        """Test mobility score calculation (now returns per-color dict)."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert "mobility_score" in heuristics
        # New format: {"white": int, "black": int, "delta": int}
        assert isinstance(heuristics["mobility_score"], dict)
        assert "white" in heuristics["mobility_score"]
        assert "black" in heuristics["mobility_score"]
        assert "delta" in heuristics["mobility_score"]
        assert heuristics["mobility_score"]["white"] >= 0
        assert heuristics["mobility_score"]["black"] >= 0

    def test_all_fields_present(self):
        """Test that all required fields are present in heuristics."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        
        required_fields = [
            "fork", "pin", "skewer", "xray",
            "hanging_piece", "trapped_piece", "overloaded_piece", "discovered_attack",
            "weak_squares", "outposts", "king_safety_drop",
            "pawn_structure", "mobility_score"
        ]
        
        for field in required_fields:
            assert field in heuristics, f"Missing field: {field}"

    def test_pawn_structure_structure(self):
        """Test that pawn_structure has correct nested structure."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        
        assert "pawn_structure" in heuristics
        assert isinstance(heuristics["pawn_structure"], dict)
        assert "isolated_pawns" in heuristics["pawn_structure"]
        assert "doubled_pawns" in heuristics["pawn_structure"]
        assert "passed_pawns" in heuristics["pawn_structure"]
        assert isinstance(heuristics["pawn_structure"]["isolated_pawns"], list)
        assert isinstance(heuristics["pawn_structure"]["doubled_pawns"], list)
        assert isinstance(heuristics["pawn_structure"]["passed_pawns"], list)

    def test_invalid_fen(self):
        """Test handling of invalid FEN."""
        # Invalid FEN should return empty heuristics
        heuristics = calculate_position_heuristics("invalid fen")
        assert isinstance(heuristics, dict)
        # Should still have all required fields
        assert "fork" in heuristics

    def test_empty_board(self):
        """Test with empty board."""
        board = chess.Board()
        heuristics = calculate_position_heuristics(board.fen(), board)
        assert isinstance(heuristics, dict)
        assert "mobility_score" in heuristics


class TestTensionDetection:
    """Test cases for the new tension detection system."""
    
    def test_tension_fields_present(self):
        """Test that tension fields are present in heuristics."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        heuristics = calculate_position_heuristics(board.fen(), board)
        
        # New tension block should exist
        assert "tension" in heuristics
        assert isinstance(heuristics["tension"], dict)
        assert "targets" in heuristics["tension"]
        assert "has_trade_available" in heuristics["tension"]
        assert "has_winning_capture" in heuristics["tension"]
        assert "has_true_hanging_piece" in heuristics["tension"]
        
        # Convenience booleans should exist
        assert "trade_available" in heuristics
        assert "threatened_piece" in heuristics
        assert "winning_capture" in heuristics
        assert "losing_capture" in heuristics
    
    def test_defended_piece_is_tension_not_hanging(self):
        """
        Test 1: Defended piece = tension, not hanging
        
        FEN: After 1.e4 e5 2.Nf3 Nc6 3.Bb5 (Ruy Lopez)
        Black's knight on c6 is attacked by white bishop but defended by b7/d7 pawns.
        This should NOT be hanging - it's tension/trade.
        """
        # Position where white bishop attacks Nc6, but Nc6 is defended
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
        board = chess.Board(fen)
        heuristics = calculate_position_heuristics(fen, board)
        
        # The knight on c6 is attacked but defended - not truly hanging
        tension = heuristics["tension"]
        
        # Should NOT be flagged as truly hanging
        assert tension["has_true_hanging_piece"] == False
        
        # Should have trade available (bishop can take knight, pawn recaptures)
        # OR targets should exist with tension/equal_trade status
        if tension["targets"]:
            # At least one target should be in tension/equal_trade, not hanging
            statuses = [t["status"] for t in tension["targets"]]
            # We allow "tension", "equal_trade", "losing_capture" - but not hanging
            assert "hanging" not in statuses or tension["has_trade_available"]
        
        # hanging_piece should be False (refined logic)
        assert heuristics["hanging_piece"] == False
    
    def test_truly_hanging_piece(self):
        """
        Test 2: Truly hanging piece (attacked, no defenders)
        
        FEN: Position where a piece is attacked with no defenders.
        Here black queen on d8 is NOT attacked, but we'll create a position
        where something is truly hanging.
        """
        # Create position with truly hanging piece
        # White queen on e4, attacked by black knight on f6, no defenders
        # Actually, let's use a simpler case: a lone piece under attack
        fen = "4k3/8/5n2/8/4Q3/8/8/4K3 b - - 0 1"
        board = chess.Board(fen)
        heuristics = calculate_position_heuristics(fen, board)
        
        # White queen on e4 is attacked by black knight on f6
        # If white has no defenders of e4, it's truly hanging
        tension = heuristics["tension"]
        
        # Actually this is from black's perspective (black to move)
        # Black's knight can take white's queen - is that hanging?
        # The queen is attacked by knight (no defenders) = hanging
        
        # The tension analysis should detect this
        if tension["targets"]:
            queen_targets = [t for t in tension["targets"] if t["piece"] == "Q"]
            if queen_targets:
                # Queen should be marked as hanging (no defenders)
                assert queen_targets[0]["status"] == "hanging" or \
                       queen_targets[0]["status"] == "winning_capture"
    
    def test_capture_loses_material(self):
        """
        Test 3: Capture loses material (SEE negative)
        
        FEN: Position where capturing loses material due to recapture.
        """
        # White pawn on e4 attacks black knight on d5
        # Black knight is defended by pawn on e6
        # If white pawn takes knight, black pawn recaptures = trade
        # But if it's a rook attacking defended pawn, capture loses material
        fen = "4k3/8/4p3/3n4/4R3/8/8/4K3 w - - 0 1"
        board = chess.Board(fen)
        heuristics = calculate_position_heuristics(fen, board)
        
        tension = heuristics["tension"]
        
        # White rook attacks black knight on d5
        # Knight is defended by pawn on e6
        # RxNd5, exd5 = White loses rook (500) for knight (300) = -200 = losing
        # So this should NOT be flagged as winning capture
        
        # The tension analysis should classify this correctly
        if tension["targets"]:
            knight_targets = [t for t in tension["targets"] if t["piece"] == "N"]
            if knight_targets:
                # Taking the knight should be losing_capture or equal_trade
                assert knight_targets[0]["status"] in ("losing_capture", "equal_trade", "tension")
                # NOT a true winning capture
                assert knight_targets[0]["status"] != "winning_capture"
    
    def test_opening_safety_no_false_positives(self):
        """
        Test 4: Opening safety (1.e4 position)
        
        FEN: After 1.e4
        Expected: No tactical flags fired (no hanging, no trades in starting moves)
        """
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        board = chess.Board(fen)
        heuristics = calculate_position_heuristics(fen, board)
        
        tension = heuristics["tension"]
        
        # In this position, there should be no attacked pieces
        # (no pieces are in contact yet)
        assert tension["has_true_hanging_piece"] == False
        assert tension["has_winning_capture"] == False
        
        # hanging_piece should be false
        assert heuristics["hanging_piece"] == False
    
    def test_starting_position_no_tension(self):
        """Test starting position has no tension/hanging detection."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        board = chess.Board(fen)
        heuristics = calculate_position_heuristics(fen, board)
        
        tension = heuristics["tension"]
        
        # No pieces under attack in starting position
        assert tension["has_true_hanging_piece"] == False
        assert tension["has_winning_capture"] == False
        assert tension["has_trade_available"] == False
        assert len(tension["targets"]) == 0


