"""
Motif Detection Layer for Rich Stockfish Commentary.

Consolidates tactical motif detection from existing heuristics into a unified
interface. Each motif is derived from board state + PV + existing heuristics.

Feature-flagged behind ENABLE_RICH_STOCKFISH_COMMENTARY.
"""

import os
import chess
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional, Tuple

# Feature flag
ENABLE_RICH_STOCKFISH_COMMENTARY = os.getenv(
    "ENABLE_RICH_STOCKFISH_COMMENTARY", "true"
).lower() == "true"

# Piece values for tactical evaluation
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 100,
}


@dataclass
class DetectedMotifs:
    """
    Container for all detected tactical motifs.
    
    Each field is either a boolean or structured data with details.
    All fields are evidence-based and deterministically derived.
    """
    # Fork: piece attacking 2+ valuable targets
    fork: bool = False
    fork_square: Optional[str] = None
    fork_targets: List[str] = field(default_factory=list)
    fork_attacker: Optional[str] = None  # e.g., "knight"
    
    # Pin: piece cannot move without exposing more valuable piece
    pin: bool = False
    pin_line: List[str] = field(default_factory=list)
    pinned_piece: Optional[str] = None
    pinner_piece: Optional[str] = None
    pin_to_king: bool = False
    
    # Skewer: attack through piece to more valuable one behind
    skewer: bool = False
    skewer_squares: List[str] = field(default_factory=list)
    
    # Passed pawn: pawn with no opposing pawns blocking or attacking
    passed_pawn: bool = False
    passed_pawn_square: Optional[str] = None
    promotion_distance: Optional[int] = None
    
    # Back-rank weakness: king trapped on back rank
    back_rank_weakness: bool = False
    back_rank: Optional[int] = None
    
    # Hanging piece: undefended piece under attack
    hanging_piece: bool = False
    hanging_squares: List[str] = field(default_factory=list)
    
    # Only move: forced response (multipv gap >= threshold)
    only_move: bool = False
    forced_line: List[str] = field(default_factory=list)
    
    # Promotion threat: pawn 1-2 squares from queening
    promotion_threat: bool = False
    promotion_square: Optional[str] = None
    promoting_pawn_square: Optional[str] = None
    
    # Forced capture: must recapture or lose material
    forced_capture: bool = False
    capture_square: Optional[str] = None
    
    # Discovered attack: moving piece reveals attack
    discovered_attack: bool = False
    discovered_attacker: Optional[str] = None
    discovered_target: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)
    
    def any_tactical(self) -> bool:
        """Check if any tactical motif is detected."""
        return (
            self.fork or self.pin or self.skewer or
            self.hanging_piece or self.discovered_attack or
            self.back_rank_weakness
        )
    
    def any_pawn_motif(self) -> bool:
        """Check if any pawn-related motif is detected."""
        return self.passed_pawn or self.promotion_threat


def _detect_fork(
    board: chess.Board,
    to_sq: chess.Square,
    moved_piece: chess.Piece,
) -> Tuple[bool, List[str]]:
    """
    Detect if the piece on to_sq creates a fork.
    
    A fork requires attacking 2+ pieces with combined value >= 4
    or including the king.
    """
    if moved_piece is None:
        return False, []
    
    mover_color = moved_piece.color
    targets = []
    
    # Get all squares attacked by this piece
    attacks = board.attacks(to_sq)
    
    for sq in attacks:
        target = board.piece_at(sq)
        if target and target.color != mover_color:
            value = PIECE_VALUES.get(target.piece_type, 0)
            if value >= 3 or target.piece_type == chess.KING:
                targets.append((sq, target))
    
    if len(targets) >= 2:
        # Check if fork is valuable
        has_king = any(t[1].piece_type == chess.KING for t in targets)
        total_value = sum(PIECE_VALUES.get(t[1].piece_type, 0) for t in targets)
        
        if has_king or total_value >= 6:
            return True, [chess.square_name(t[0]) for t in targets]
    
    return False, []


def _detect_pin(board: chess.Board) -> Tuple[bool, Dict[str, Any]]:
    """
    Detect absolute pins (to king) in the position.
    
    Returns pin info if found.
    """
    for color in [chess.WHITE, chess.BLACK]:
        king_sq = board.king(color)
        if king_sq is None:
            continue
        
        # Check all pieces of this color for pins
        for sq in chess.SQUARES:
            piece = board.piece_at(sq)
            if piece is None or piece.color != color:
                continue
            if piece.piece_type == chess.KING:
                continue
            
            # Check if this piece is pinned
            if board.is_pinned(color, sq):
                # Find the pinner
                pin_mask = board.pin(color, sq)
                # The pinner is the enemy piece on this ray
                for pinner_sq in chess.SQUARES:
                    if pinner_sq == sq or pinner_sq == king_sq:
                        continue
                    if pin_mask & chess.BB_SQUARES[pinner_sq]:
                        pinner = board.piece_at(pinner_sq)
                        if pinner and pinner.color != color:
                            piece_names = {
                                chess.PAWN: "pawn", chess.KNIGHT: "knight",
                                chess.BISHOP: "bishop", chess.ROOK: "rook",
                                chess.QUEEN: "queen", chess.KING: "king"
                            }
                            return True, {
                                "pin_line": [
                                    chess.square_name(pinner_sq),
                                    chess.square_name(sq),
                                    chess.square_name(king_sq)
                                ],
                                "pinned_piece": piece_names.get(piece.piece_type, "piece"),
                                "pinner_piece": piece_names.get(pinner.piece_type, "piece"),
                                "pin_to_king": True,
                            }
    
    return False, {}


def _detect_skewer(board: chess.Board) -> Tuple[bool, List[str]]:
    """
    Detect skewers: attack through valuable piece to less valuable behind.
    """
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None:
            continue
        if piece.piece_type not in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
            continue
        
        # Check rays from this piece
        attacks = board.attacks(sq)
        for target_sq in attacks:
            target = board.piece_at(target_sq)
            if target is None or target.color == piece.color:
                continue
            
            # Check if there's a piece behind target on the same ray
            ray = chess.ray(sq, target_sq)
            for behind_sq in chess.SQUARES:
                if behind_sq == sq or behind_sq == target_sq:
                    continue
                if ray & chess.BB_SQUARES[behind_sq]:
                    behind = board.piece_at(behind_sq)
                    if behind and behind.color == target.color:
                        # Skewer exists if front piece is more valuable
                        front_val = PIECE_VALUES.get(target.piece_type, 0)
                        behind_val = PIECE_VALUES.get(behind.piece_type, 0)
                        if front_val > behind_val and front_val >= 5:
                            return True, [
                                chess.square_name(sq),
                                chess.square_name(target_sq),
                                chess.square_name(behind_sq)
                            ]
    
    return False, []


def _detect_passed_pawn(board: chess.Board) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Detect passed pawns (advanced, on ranks 6-7 for white, 2-3 for black).
    """
    for color in [chess.WHITE, chess.BLACK]:
        # Only check advanced pawns (0-indexed ranks)
        # White: rank 5 (6th) and rank 6 (7th)
        # Black: rank 2 (3rd) and rank 1 (2nd)
        if color == chess.WHITE:
            target_ranks = [5, 6]  # 6th and 7th rank (0-indexed)
            promotion_rank = 7
        else:
            target_ranks = [2, 1]  # 3rd and 2nd rank (0-indexed)
            promotion_rank = 0
        
        for sq in chess.SQUARES:
            piece = board.piece_at(sq)
            if piece is None or piece.piece_type != chess.PAWN or piece.color != color:
                continue
            
            rank = chess.square_rank(sq)
            if rank not in target_ranks:
                continue
            
            # Check if passed (no opposing pawns blocking or attacking)
            file = chess.square_file(sq)
            is_passed = True
            
            # Check for blocking pawns
            if color == chess.WHITE:
                check_range = range(rank + 1, 8)
            else:
                check_range = range(0, rank)
            
            for test_rank in check_range:
                for test_file in [file - 1, file, file + 1]:
                    if 0 <= test_file <= 7:
                        test_sq = chess.square(test_file, test_rank)
                        test_piece = board.piece_at(test_sq)
                        if test_piece and test_piece.piece_type == chess.PAWN and test_piece.color != color:
                            is_passed = False
                            break
                if not is_passed:
                    break
            
            if is_passed:
                distance = abs(promotion_rank - rank)
                return True, chess.square_name(sq), distance
    
    return False, None, None


def _detect_promotion_threat(board: chess.Board) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Detect pawns threatening promotion (1-2 squares away).
    """
    for color in [chess.WHITE, chess.BLACK]:
        if color == chess.WHITE:
            threat_ranks = [6, 5]  # 7th and 6th rank (0-indexed)
            promotion_rank = 7
        else:
            threat_ranks = [1, 2]  # 2nd and 3rd rank (0-indexed)
            promotion_rank = 0
        
        for sq in chess.SQUARES:
            piece = board.piece_at(sq)
            if piece is None or piece.piece_type != chess.PAWN or piece.color != color:
                continue
            
            rank = chess.square_rank(sq)
            if rank in threat_ranks:
                file = chess.square_file(sq)
                promotion_sq = chess.square(file, promotion_rank)
                return True, chess.square_name(promotion_sq), chess.square_name(sq)
    
    return False, None, None


def _detect_back_rank_weakness(board: chess.Board) -> Tuple[bool, Optional[int]]:
    """
    Detect if king is vulnerable on the back rank.
    
    Conditions:
    - King on back rank
    - No escape squares (pawns in front)
    - Enemy rook/queen can reach back rank
    """
    for color in [chess.WHITE, chess.BLACK]:
        king_sq = board.king(color)
        if king_sq is None:
            continue
        
        back_rank = 0 if color == chess.WHITE else 7
        if chess.square_rank(king_sq) != back_rank:
            continue
        
        # Check if pawns block escape
        king_file = chess.square_file(king_sq)
        escape_blocked = True
        
        for df in [-1, 0, 1]:
            f = king_file + df
            if 0 <= f <= 7:
                escape_rank = 1 if color == chess.WHITE else 6
                escape_sq = chess.square(f, escape_rank)
                piece = board.piece_at(escape_sq)
                if piece is None or piece.piece_type != chess.PAWN or piece.color != color:
                    escape_blocked = False
                    break
        
        if escape_blocked:
            # Check if enemy has rook/queen
            enemy = not color
            for sq in chess.SQUARES:
                piece = board.piece_at(sq)
                if piece and piece.color == enemy and piece.piece_type in [chess.ROOK, chess.QUEEN]:
                    return True, back_rank + 1  # 1-indexed for display
    
    return False, None


def _detect_hanging(
    heuristics: Dict[str, Any]
) -> Tuple[bool, List[str]]:
    """
    Extract hanging piece info from existing heuristics.
    """
    tension = heuristics.get("tension", {})
    
    # Check for true hanging pieces
    if tension.get("has_true_hanging_piece"):
        hanging = tension.get("true_hanging_targets", [])
        if hanging:
            return True, [h.get("square", "") for h in hanging if h.get("square")]
    
    # Fallback to hanging_piece flag
    if heuristics.get("hanging_piece"):
        return True, []
    
    return False, []


def _detect_only_move(
    engine_data: Dict[str, Any]
) -> Tuple[bool, List[str]]:
    """
    Detect "only move" from engine multipv data.
    
    Only move = multipv_gap_cp >= 150 or is_forced flag.
    """
    if engine_data.get("is_forced"):
        pv = engine_data.get("pv", [])
        return True, pv[:5]  # First 5 moves of PV
    
    gap = engine_data.get("multipv_gap_cp", 0)
    if gap >= 150:
        pv = engine_data.get("pv", [])
        return True, pv[:5]
    
    return False, []


def detect_motifs(
    fen: str,
    move_san: Optional[str] = None,
    heuristics: Optional[Dict[str, Any]] = None,
    engine_data: Optional[Dict[str, Any]] = None,
) -> DetectedMotifs:
    """
    Detect all tactical motifs from position, move, and analysis data.
    
    This is the main entry point for the motif detection layer.
    
    Args:
        fen: Position FEN (after move if move_san is provided)
        move_san: Move that was played (for context)
        heuristics: Existing heuristics dict from heuristics_service
        engine_data: Stockfish analysis data (PV, eval, multipv)
        
    Returns:
        DetectedMotifs with all detected patterns
    """
    if not ENABLE_RICH_STOCKFISH_COMMENTARY:
        return DetectedMotifs()
    
    heuristics = heuristics or {}
    engine_data = engine_data or {}
    
    try:
        board = chess.Board(fen)
    except:
        return DetectedMotifs()
    
    motifs = DetectedMotifs()
    
    # 1. Fork detection
    # Use existing heuristics first, then detect if move provided
    if heuristics.get("fork"):
        motifs.fork = True
        fork_data = heuristics.get("fork_data", {})
        motifs.fork_square = fork_data.get("square")
        motifs.fork_targets = fork_data.get("targets", [])
    
    # 2. Pin detection
    pin_detected, pin_info = _detect_pin(board)
    if pin_detected:
        motifs.pin = True
        motifs.pin_line = pin_info.get("pin_line", [])
        motifs.pinned_piece = pin_info.get("pinned_piece")
        motifs.pinner_piece = pin_info.get("pinner_piece")
        motifs.pin_to_king = pin_info.get("pin_to_king", False)
    elif heuristics.get("pin"):
        motifs.pin = True
    
    # 3. Skewer detection
    skewer_detected, skewer_squares = _detect_skewer(board)
    if skewer_detected:
        motifs.skewer = True
        motifs.skewer_squares = skewer_squares
    elif heuristics.get("skewer"):
        motifs.skewer = True
    
    # 4. Passed pawn
    passed, passed_sq, distance = _detect_passed_pawn(board)
    if passed:
        motifs.passed_pawn = True
        motifs.passed_pawn_square = passed_sq
        motifs.promotion_distance = distance
    
    # 5. Promotion threat
    promo, promo_sq, pawn_sq = _detect_promotion_threat(board)
    if promo:
        motifs.promotion_threat = True
        motifs.promotion_square = promo_sq
        motifs.promoting_pawn_square = pawn_sq
    
    # 6. Back-rank weakness
    back_rank, rank = _detect_back_rank_weakness(board)
    if back_rank:
        motifs.back_rank_weakness = True
        motifs.back_rank = rank
    
    # 7. Hanging piece (from heuristics)
    hanging, hanging_squares = _detect_hanging(heuristics)
    if hanging:
        motifs.hanging_piece = True
        motifs.hanging_squares = hanging_squares
    
    # 8. Only move (from engine data)
    only_move, forced_line = _detect_only_move(engine_data)
    if only_move:
        motifs.only_move = True
        motifs.forced_line = forced_line
    
    # 9. Discovered attack (from heuristics)
    if heuristics.get("discovered_attack"):
        motifs.discovered_attack = True
    
    return motifs


# Convenience function for testing
def get_motif_summary(motifs: DetectedMotifs) -> List[str]:
    """Get a list of detected motif names for logging/testing."""
    detected = []
    if motifs.fork:
        detected.append("fork")
    if motifs.pin:
        detected.append("pin")
    if motifs.skewer:
        detected.append("skewer")
    if motifs.passed_pawn:
        detected.append("passed_pawn")
    if motifs.promotion_threat:
        detected.append("promotion_threat")
    if motifs.back_rank_weakness:
        detected.append("back_rank")
    if motifs.hanging_piece:
        detected.append("hanging")
    if motifs.only_move:
        detected.append("only_move")
    if motifs.discovered_attack:
        detected.append("discovered_attack")
    return detected
