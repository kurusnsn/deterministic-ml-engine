"""
Tests for LC0 ONNX Encoder.

Validates that FEN encoding produces correct 112-plane input tensors
matching LC0's expected format.
"""

import pytest
import numpy as np
import chess

from gateway_modules.lc0_onnx.encoder import (
    encode_fen_lc0,
    encode_fen_batch,
    validate_encoding,
)


class TestEncodeFenLc0:
    """Tests for encode_fen_lc0 function."""
    
    def test_starting_position_shape(self):
        """Starting position should produce (1, 112, 8, 8) tensor."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        encoded = encode_fen_lc0(fen)
        
        assert encoded.shape == (1, 112, 8, 8)
        assert encoded.dtype == np.float32
    
    def test_starting_position_piece_planes(self):
        """Starting position should have correct piece placements."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        encoded = encode_fen_lc0(fen)
        
        # White pawns (plane 0) on rank 1 (from white's perspective)
        white_pawns = encoded[0, 0, 1, :]  # rank 1
        assert white_pawns.sum() == 8
        
        # Black pawns (plane 6) on rank 6 (from white's perspective)
        black_pawns = encoded[0, 6, 6, :]  # rank 6
        assert black_pawns.sum() == 8
    
    def test_castling_planes_starting_position(self):
        """Starting position should have all castling rights."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        encoded = encode_fen_lc0(fen)
        
        # Planes 104-107 are castling rights (all ones for full rights)
        assert encoded[0, 104].sum() > 0  # White kingside
        assert encoded[0, 105].sum() > 0  # White queenside
        assert encoded[0, 106].sum() > 0  # Black kingside
        assert encoded[0, 107].sum() > 0  # Black queenside
    
    def test_castling_planes_no_castling(self):
        """Position without castling rights should have zeros."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"
        encoded = encode_fen_lc0(fen)
        
        # No castling rights
        assert encoded[0, 104].sum() == 0
        assert encoded[0, 105].sum() == 0
        assert encoded[0, 106].sum() == 0
        assert encoded[0, 107].sum() == 0
    
    def test_side_to_move_plane(self):
        """Side to move plane should be set correctly."""
        # White to move
        fen_white = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        encoded_white = encode_fen_lc0(fen_white)
        assert encoded_white[0, 108].sum() > 0  # Side to move = 1
        
        # Black to move
        fen_black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        encoded_black = encode_fen_lc0(fen_black)
        # For black, from black's perspective, side to move is still 1
        assert encoded_black[0, 108].sum() > 0
    
    def test_en_passant_plane(self):
        """En passant square should be encoded correctly."""
        # Position with en passant available
        fen = "rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6 0 1"
        encoded = encode_fen_lc0(fen)
        
        # EP square on plane 111
        assert encoded[0, 111].sum() == 1  # One EP square
    
    def test_move_count_normalization(self):
        """Move count should be normalized."""
        fen_early = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        fen_late = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 50"
        
        encoded_early = encode_fen_lc0(fen_early)
        encoded_late = encode_fen_lc0(fen_late)
        
        # Move count plane (109) should be higher for later game
        assert encoded_late[0, 109, 0, 0] > encoded_early[0, 109, 0, 0]
    
    def test_deterministic_encoding(self):
        """Same FEN should produce identical encoding."""
        fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"
        
        encoded1 = encode_fen_lc0(fen)
        encoded2 = encode_fen_lc0(fen)
        
        np.testing.assert_array_equal(encoded1, encoded2)
    
    def test_different_positions_different_encoding(self):
        """Different positions should produce different encodings."""
        fen1 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        fen2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        
        encoded1 = encode_fen_lc0(fen1)
        encoded2 = encode_fen_lc0(fen2)
        
        assert not np.array_equal(encoded1, encoded2)


class TestEncodeFenBatch:
    """Tests for batch encoding."""
    
    def test_batch_shape(self):
        """Batch encoding should have correct shape."""
        fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
        ]
        
        encoded = encode_fen_batch(fens)
        
        assert encoded.shape == (3, 112, 8, 8)
    
    def test_batch_deterministic(self):
        """Batch encoding should be deterministic."""
        fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        ]
        
        encoded1 = encode_fen_batch(fens)
        encoded2 = encode_fen_batch(fens)
        
        np.testing.assert_array_equal(encoded1, encoded2)


class TestValidateEncoding:
    """Tests for encoding validation."""
    
    def test_validate_encoding_starting(self):
        """Validate encoding returns correct info for starting position."""
        fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        info = validate_encoding(fen)
        
        assert info['fen'] == fen
        assert info['shape'] == (1, 112, 8, 8)
        assert info['dtype'] == 'float32'
        assert info['piece_count'] == 32
        assert info['side_to_move'] == 'white'
    
    def test_validate_encoding_black_to_move(self):
        """Validate encoding with black to move."""
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        info = validate_encoding(fen)
        
        assert info['side_to_move'] == 'black'
