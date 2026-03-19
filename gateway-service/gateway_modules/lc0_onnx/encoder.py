"""
LC0 112-Plane Input Encoder.

Converts chess FEN notation to LC0's 112-plane input format.
This encoder produces identical output to the existing lc0_extractor.py
to ensure activation compatibility with trained probes.
"""

import numpy as np
import chess
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def encode_fen_lc0(fen: str, history: Optional[list] = None) -> np.ndarray:
    """
    Convert FEN to LC0 input tensor.
    
    LC0 uses a 112-plane input encoding in NCHW format:
    - 13 planes per position (6 piece types × 2 colors + 1 repetition)
    - 8 history positions (current + 7 previous)
    - 8 auxiliary planes (castling rights, en passant, side to move, etc.)
    
    For probing, we use single-position encoding (no history) which matches
    how the existing SVM probes were trained.
    
    Args:
        fen: Chess position in FEN notation
        history: Optional list of previous FENs (not used for probing)
        
    Returns:
        numpy array of shape (1, 112, 8, 8) in float32
        
    Note:
        The output matches the format expected by LC0's neural network,
        with planes in NCHW order (channels first).
    """
    board = chess.Board(fen)
    
    # Initialize 112 planes (8x8 each)
    planes = np.zeros((112, 8, 8), dtype=np.float32)
    
    # Determine perspective (flip for black to move)
    flip = board.turn == chess.BLACK
    
    # ==========================================================================
    # Piece planes (planes 0-12 for current position, repeated for history)
    # For probing we only use current position planes 0-12
    # ==========================================================================
    piece_to_plane = {
        (chess.PAWN, True): 0,     # Our pawns
        (chess.KNIGHT, True): 1,   # Our knights
        (chess.BISHOP, True): 2,   # Our bishops  
        (chess.ROOK, True): 3,     # Our rooks
        (chess.QUEEN, True): 4,    # Our queens
        (chess.KING, True): 5,     # Our king
        (chess.PAWN, False): 6,    # Their pawns
        (chess.KNIGHT, False): 7,  # Their knights
        (chess.BISHOP, False): 8,  # Their bishops
        (chess.ROOK, False): 9,    # Their rooks
        (chess.QUEEN, False): 10,  # Their queens
        (chess.KING, False): 11,   # Their king
    }
    
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece:
            # Determine if this is "our" piece (same color as side to move)
            is_ours = piece.color == board.turn
            plane_idx = piece_to_plane.get((piece.piece_type, is_ours))
            
            if plane_idx is not None:
                rank = chess.square_rank(sq)
                file = chess.square_file(sq)
                
                # Flip board if playing as black
                if flip:
                    rank = 7 - rank
                
                planes[plane_idx, rank, file] = 1.0
    
    # Plane 12: Repetition (0 if no repetitions, 1 if repeated)
    # For single-position probing, always 0
    # planes[12, :, :] = 0.0  # Already zero
    
    # ==========================================================================
    # History planes (planes 13-103)
    # For probing without history, copy current position or leave zero
    # Matching existing behavior of the TF extractor
    # ==========================================================================
    # planes[13:104] = 0.0  # Already zero - no history for probing
    
    # ==========================================================================
    # Auxiliary planes (planes 104-111)
    # ==========================================================================
    
    # Castling rights (from perspective of side to move after flipping)
    # Plane 104: Can we castle kingside?
    if board.turn == chess.WHITE:
        if board.has_kingside_castling_rights(chess.WHITE):
            planes[104, :, :] = 1.0
        if board.has_queenside_castling_rights(chess.WHITE):
            planes[105, :, :] = 1.0
        if board.has_kingside_castling_rights(chess.BLACK):
            planes[106, :, :] = 1.0
        if board.has_queenside_castling_rights(chess.BLACK):
            planes[107, :, :] = 1.0
    else:
        # Flip castling rights perspective for black
        if board.has_kingside_castling_rights(chess.BLACK):
            planes[104, :, :] = 1.0
        if board.has_queenside_castling_rights(chess.BLACK):
            planes[105, :, :] = 1.0
        if board.has_kingside_castling_rights(chess.WHITE):
            planes[106, :, :] = 1.0
        if board.has_queenside_castling_rights(chess.WHITE):
            planes[107, :, :] = 1.0
    
    # Plane 108: Side to move (always 1, since we encode from mover's perspective)
    planes[108, :, :] = 1.0
    
    # Plane 109: Move count (normalized by 100, capped at 1.0)
    # Note: This may not be filled identically to LC0's encoding but
    # should be sufficient for probe activation extraction
    move_count_normalized = min(board.fullmove_number / 100.0, 1.0)
    planes[109, :, :] = move_count_normalized
    
    # Plane 110: Halfmove clock (for 50-move rule, normalized)
    halfmove_normalized = min(board.halfmove_clock / 100.0, 1.0)
    planes[110, :, :] = halfmove_normalized
    
    # Plane 111: En passant square (if available)
    if board.ep_square is not None:
        ep_rank = chess.square_rank(board.ep_square)
        ep_file = chess.square_file(board.ep_square)
        if flip:
            ep_rank = 7 - ep_rank
        planes[111, ep_rank, ep_file] = 1.0
    
    # Add batch dimension: (112, 8, 8) -> (1, 112, 8, 8)
    return planes.reshape(1, 112, 8, 8)


def encode_fen_batch(fens: list) -> np.ndarray:
    """
    Encode multiple FENs as a batch.
    
    Args:
        fens: List of FEN strings
        
    Returns:
        numpy array of shape (batch_size, 112, 8, 8)
    """
    batch = [encode_fen_lc0(fen) for fen in fens]
    return np.concatenate(batch, axis=0)


def validate_encoding(fen: str) -> dict:
    """
    Validate encoding for a FEN and return debug info.
    
    Useful for debugging encoding differences between this
    encoder and the original TF-based encoder.
    
    Args:
        fen: FEN string to encode
        
    Returns:
        Dict with encoding stats and plane summaries
    """
    encoded = encode_fen_lc0(fen)
    board = chess.Board(fen)
    
    return {
        "fen": fen,
        "shape": encoded.shape,
        "dtype": str(encoded.dtype),
        "non_zero_planes": int((encoded.sum(axis=(2, 3)) > 0).sum()),
        "piece_count": len(board.piece_map()),
        "side_to_move": "white" if board.turn == chess.WHITE else "black",
        "castling": board.castling_rights,
        "en_passant": board.ep_square,
        "plane_sums": {
            "piece_planes_0_12": float(encoded[0, 0:13].sum()),
            "castling_104_107": float(encoded[0, 104:108].sum()),
            "auxiliary_108_111": float(encoded[0, 108:112].sum()),
        }
    }
