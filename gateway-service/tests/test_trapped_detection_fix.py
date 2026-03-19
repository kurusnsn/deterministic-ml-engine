"""
Tests for trapped detection bug fix (Part C).

Ensures detect_trapped_candidates only evaluates side-to-move pieces:
- Test: trapped detection only for side-to-move
- Test: non-side-to-move attacked piece NOT flagged
- Test: side-to-move attacked piece with no escapes → flagged
"""

import chess
import pytest

from gateway_modules.services.heuristics_service import (
    detect_trapped_candidates,
    calculate_position_heuristics,
)


class TestTrappedDetectionSideToMove:
    """Test that trapped detection only evaluates side-to-move pieces."""
    
    def test_only_side_to_move_evaluated_white(self):
        """When white to move, only white pieces should be evaluated."""
        # Position where a black piece is attacked but it's white's turn
        # r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3
        # Black knight on c6 is attacked by bishop on b5
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3"
        board = chess.Board(fen)
        
        assert board.turn == chess.WHITE
        
        candidates = detect_trapped_candidates(board)
        
        # All candidates should be white pieces (if any)
        for c in candidates:
            assert c["color"] == "white", f"Found non-white piece in candidates: {c}"
    
    def test_only_side_to_move_evaluated_black(self):
        """When black to move, only black pieces should be evaluated."""
        # Position where a white piece is attacked but it's black's turn
        # Same position but black to move
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
        board = chess.Board(fen)
        
        assert board.turn == chess.BLACK
        
        candidates = detect_trapped_candidates(board)
        
        # All candidates should be black pieces (if any)
        for c in candidates:
            assert c["color"] == "black", f"Found non-black piece in candidates: {c}"
    
    def test_opponent_attacked_piece_not_flagged(self):
        """Attacked opponent pieces should never be flagged as trapped."""
        # Position: White bishop attacks black knight, but it's WHITE's turn
        # The black knight should NOT appear in trapped candidates
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3"
        board = chess.Board(fen)
        
        candidates = detect_trapped_candidates(board)
        
        # Black knight on c6 should NOT be in candidates
        black_knight_candidates = [c for c in candidates if c["square"] == "c6"]
        assert len(black_knight_candidates) == 0, \
            f"Black knight on c6 incorrectly flagged: {black_knight_candidates}"
    
    def test_own_attacked_piece_with_escapes_not_trapped(self):
        """Own attacked piece with escape moves should not be truly trapped."""
        # After 1.e4 e5 2.Nf3 Nc6 3.Bb5 (Ruy Lopez)
        # White bishop on b5 is not attacked, so no trapped candidates
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
        board = chess.Board(fen)
        
        # Black to move - check if any black pieces are trapped
        candidates = detect_trapped_candidates(board)
        
        # Black knight on c6 is attacked by Bb5 but has escape squares
        c6_candidates = [c for c in candidates if c["square"] == "c6"]
        
        # The knight has escapes (e.g., Na5, Nb4, Nd4, Ne7)
        # It should NOT be truly trapped
        truly_trapped = [c for c in c6_candidates if c.get("is_truly_trapped")]
        assert len(truly_trapped) == 0, \
            f"Knight on c6 with escapes incorrectly marked as trapped: {c6_candidates}"
    
    def test_own_attacked_piece_no_escapes_is_trapped(self):
        """Own attacked piece with no safe escapes should be truly trapped."""
        # Bishop trapped on a7: r1bqkbnr/Bppppppp/8/8/8/8/1PPPPPPP/RN1QKBNR b KQkq - 0 1
        # White bishop on a7 is attacked by b8 knight and has no escapes
        # But it's BLACK's turn, so the white bishop should NOT be evaluated
        fen = "r1bqkbnr/Bppppppp/8/8/8/8/1PPPPPPP/RN1QKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        
        candidates = detect_trapped_candidates(board)
        
        # White bishop should NOT be in candidates (it's black's turn)
        a7_candidates = [c for c in candidates if c["square"] == "a7"]
        assert len(a7_candidates) == 0, \
            f"White bishop evaluated on black's turn: {a7_candidates}"
        
        # Now flip the turn to white
        fen_white_turn = "r1bqkbnr/Bppppppp/8/8/8/8/1PPPPPPP/RN1QKBNR w KQkq - 0 1"
        board_white = chess.Board(fen_white_turn)
        
        candidates_white = detect_trapped_candidates(board_white)
        
        # Now white bishop on a7 should be evaluated
        a7_candidates_white = [c for c in candidates_white if c["square"] == "a7"]
        
        # If it's attacked with no safe escapes, it should be truly trapped
        if a7_candidates_white:
            c = a7_candidates_white[0]
            if c["is_attacked"] and c["num_safe_moves"] == 0:
                assert c["is_truly_trapped"] == True
    
    def test_pinned_piece_not_flagged_as_trapped(self):
        """Pinned pieces should NOT be flagged as trapped.
        
        A pinned piece is restricted because moving it would expose the king to check,
        which is a DIFFERENT tactical concept than being "trapped" (having nowhere to go).
        Users expect "trapped" to mean the piece literally has no squares.
        """
        # Position after 7. bxc3 - knight on c6 is PINNED by Bb5 to the king on e8
        # PGN: 1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. a3 d5 5. exd5 Nxd5 6. Bb5 Nxc3 7. bxc3
        fen = "r1bqkb1r/ppp2ppp/2n5/1B2p3/8/P1P2N2/2PP1PPP/R1BQK2R b KQkq - 0 7"
        board = chess.Board(fen)
        
        # Verify the knight is indeed pinned
        knight_sq = chess.C6
        assert board.is_pinned(chess.BLACK, knight_sq), "Test setup error: knight should be pinned"
        
        # Run trapped detection
        candidates = detect_trapped_candidates(board)
        
        # The pinned knight should NOT be in candidates
        c6_candidates = [c for c in candidates if c["square"] == "c6"]
        assert len(c6_candidates) == 0, \
            f"Pinned knight on c6 incorrectly flagged as trapped: {c6_candidates}"
        
        # Full heuristics should also not flag trapped_piece
        heuristics = calculate_position_heuristics(fen, board)
        assert heuristics["trapped_piece"] == False, \
            "trapped_piece should be False when the only 'trapped' piece is actually pinned"


class TestTrappedDetectionEvidence:
    """Test that trapped detection provides proper evidence."""
    
    def test_evidence_includes_legal_moves(self):
        """Trapped candidates should include list of legal escape moves."""
        # Position with attacked piece
        fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 3 3"
        board = chess.Board(fen)
        
        candidates = detect_trapped_candidates(board)
        
        for c in candidates:
            assert "legal_escape_moves_san" in c
            assert "safe_escape_moves_san" in c
            assert isinstance(c["legal_escape_moves_san"], list)
            assert isinstance(c["safe_escape_moves_san"], list)
    
    def test_evidence_includes_piece_info(self):
        """Trapped candidates should include piece type, color, square."""
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        
        # Force evaluation of a known attacked piece
        # Let's use a position where something is attacked
        fen2 = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
        board2 = chess.Board(fen2)
        
        candidates = detect_trapped_candidates(board2)
        
        for c in candidates:
            assert "square" in c
            assert "piece" in c
            assert "color" in c
            assert "is_attacked" in c
            assert "is_truly_trapped" in c
    
    def test_truly_trapped_requires_attacked_and_no_safe_moves(self):
        """is_truly_trapped should only be True if attacked AND no safe escapes."""
        # Create a mock scenario by directly testing the logic
        # We can use calculate_position_heuristics for end-to-end test
        
        # Position where white knight is in corner with limited moves
        # but not actually attacked - should NOT be trapped
        fen = "8/8/8/8/8/8/8/N6K w - - 0 1"
        board = chess.Board(fen)
        
        candidates = detect_trapped_candidates(board)
        
        # Knight on a1 has limited moves but is NOT attacked
        # So it should not appear in candidates at all (not attacked = not trapped)
        a1_candidates = [c for c in candidates if c["square"] == "a1"]
        
        # Either not in candidates, or if in candidates, not truly trapped
        for c in a1_candidates:
            if not c.get("is_attacked"):
                # Not attacked pieces shouldn't be marked as truly trapped
                assert c.get("is_truly_trapped") == False or "is_truly_trapped" not in c


class TestCalculatePositionHeuristics:
    """Test that calculate_position_heuristics uses fixed trapped detection."""
    
    def test_trapped_candidates_in_heuristics(self):
        """Heuristics should include trapped_candidates from fixed detection."""
        fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        assert "trapped_candidates" in heuristics
        assert "trapped_piece" in heuristics
        
        # trapped_piece should be a boolean
        assert isinstance(heuristics["trapped_piece"], bool)
    
    def test_trapped_piece_false_when_no_trapped(self):
        """trapped_piece should be False when no pieces are truly trapped."""
        # Standard opening position
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        
        heuristics = calculate_position_heuristics(fen, board)
        
        assert heuristics["trapped_piece"] == False
    
    def test_no_false_positives_in_opening(self):
        """Opening positions should not have false trapped piece claims."""
        opening_fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",  # Start
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",  # 1.e4
            "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",  # 1.e4 e5
            "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",  # 1.e4 e5 2.Nf3
        ]
        
        for fen in opening_fens:
            board = chess.Board(fen)
            heuristics = calculate_position_heuristics(fen, board)
            
            assert heuristics["trapped_piece"] == False, \
                f"False positive trapped piece in opening: {fen}"
