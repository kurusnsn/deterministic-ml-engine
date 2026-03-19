"""
Extended Fact Extraction for Chess.com-Style Patterns.

Extracts facts needed by the new Chess.com-style rules in rules.yaml.
This module provides additional fact detection beyond the basic heuristics.

Feature-flagged: Only runs when ENABLE_NON_LLM_COMMENTARY=1
"""

import chess
from typing import Dict, Any, Optional, List, Set


# Piece values for material calculations
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


def _get_piece_name(piece: chess.Piece) -> str:
    """Convert piece to readable name."""
    names = {
        chess.PAWN: "pawn",
        chess.KNIGHT: "knight",
        chess.BISHOP: "bishop",
        chess.ROOK: "rook",
        chess.QUEEN: "queen",
        chess.KING: "king",
    }
    return names.get(piece.piece_type, "piece")


def _are_rooks_connected(board: chess.Board, color: chess.Color) -> bool:
    """Check if the two rooks of a color can see each other (connected)."""
    rooks = list(board.pieces(chess.ROOK, color))
    if len(rooks) < 2:
        return False
    
    r1, r2 = rooks[0], rooks[1]
    # Same rank or same file with no pieces between
    if chess.square_file(r1) == chess.square_file(r2):
        # Same file - check no pieces between
        min_rank = min(chess.square_rank(r1), chess.square_rank(r2))
        max_rank = max(chess.square_rank(r1), chess.square_rank(r2))
        for rank in range(min_rank + 1, max_rank):
            sq = chess.square(chess.square_file(r1), rank)
            if board.piece_at(sq):
                return False
        return True
    elif chess.square_rank(r1) == chess.square_rank(r2):
        # Same rank - check no pieces between
        min_file = min(chess.square_file(r1), chess.square_file(r2))
        max_file = max(chess.square_file(r1), chess.square_file(r2))
        for file in range(min_file + 1, max_file):
            sq = chess.square(file, chess.square_rank(r1))
            if board.piece_at(sq):
                return False
        return True
    return False


def _is_piece_attacked_by_pawn(board: chess.Board, square: chess.Square, attacker_color: chess.Color) -> bool:
    """Check if a square is attacked by a pawn of given color."""
    attackers = board.attackers(attacker_color, square)
    for attacker_sq in attackers:
        piece = board.piece_at(attacker_sq)
        if piece and piece.piece_type == chess.PAWN:
            return True
    return False


def _is_recapture(
    board: chess.Board,
    move: chess.Move,
    prev_board: Optional[chess.Board] = None,
) -> bool:
    """Check if this move is a recapture on the same square as previous capture."""
    if not board.is_capture(move):
        return False
    
    # If we have previous board, check if there was a capture on the to-square
    if prev_board:
        # Check if the previous move was to this square and was a capture
        # This is a simplified check - in practice we'd need the actual previous move
        pass
    
    return False


def _get_capture_value_delta(board: chess.Board, move: chess.Move) -> int:
    """Get the material value difference of a capture."""
    if not board.is_capture(move):
        return 0
    
    # Get the captured piece
    captured_sq = move.to_square
    if board.is_en_passant(move):
        # En passant capture
        return PIECE_VALUES[chess.PAWN]
    
    captured_piece = board.piece_at(captured_sq)
    if not captured_piece:
        return 0
    
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return 0
    
    captured_value = PIECE_VALUES.get(captured_piece.piece_type, 0)
    moving_value = PIECE_VALUES.get(moving_piece.piece_type, 0)
    
    # Delta: captured value - moving value (positive = good trade)
    return captured_value - moving_value


def _threatens_piece_must_move(board: chess.Board, move: chess.Move) -> Dict[str, Any]:
    """Check if the move threatens a piece that must move (kicking piece)."""
    result = {"threatens": False, "target_piece": None}
    
    # Make the move on a copy
    test_board = board.copy()
    test_board.push(move)
    
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return result
    
    to_sq = move.to_square
    mover_color = moving_piece.color
    opponent_color = not mover_color
    
    # Get squares attacked by the moved piece
    attacked = test_board.attacks(to_sq)
    
    for sq in attacked:
        target = test_board.piece_at(sq)
        if target and target.color == opponent_color:
            # Check if this piece is now attacked and was safe before
            was_attacked = len(board.attackers(mover_color, sq)) > 0
            is_defended = len(test_board.attackers(opponent_color, sq)) > 0
            
            # If piece is now attacked by a lower-value attacker, it may need to move
            if not is_defended or PIECE_VALUES.get(moving_piece.piece_type, 0) < PIECE_VALUES.get(target.piece_type, 0):
                result["threatens"] = True
                result["target_piece"] = _get_piece_name(target)
                break
    
    return result


def _defends_attacked_piece(board: chess.Board, move: chess.Move) -> Dict[str, Any]:
    """Check if the move defends a piece that was under attack."""
    result = {"defends": False, "defended_piece": None}
    
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return result
    
    mover_color = moving_piece.color
    opponent_color = not mover_color
    
    # Make the move
    test_board = board.copy()
    test_board.push(move)
    
    # Check squares now defended by the moved piece
    defended_squares = test_board.attacks(move.to_square)
    
    for sq in defended_squares:
        piece = test_board.piece_at(sq)
        if piece and piece.color == mover_color:
            # Was this piece attacked before?
            was_attacked = len(board.attackers(opponent_color, sq)) > 0
            was_defended = len(board.attackers(mover_color, sq)) > 0
            
            if was_attacked and not was_defended:
                result["defends"] = True
                result["defended_piece"] = _get_piece_name(piece)
                break
    
    return result


def _is_hanging_capture(board: chess.Board, move: chess.Move) -> Dict[str, Any]:
    """Check if the move captures a hanging (undefended) piece."""
    result = {"is_hanging": False, "captured_piece": None}
    
    if not board.is_capture(move):
        return result
    
    captured_sq = move.to_square
    captured_piece = board.piece_at(captured_sq)
    
    if not captured_piece:
        return result
    
    # Check if the captured piece was defended
    defender_color = captured_piece.color
    defenders = board.attackers(defender_color, captured_sq)
    
    if len(defenders) == 0:
        result["is_hanging"] = True
        result["captured_piece"] = _get_piece_name(captured_piece)
    
    return result


def _blocks_or_evades_check(board: chess.Board, move: chess.Move) -> Dict[str, Any]:
    """Check if the move blocks or evades a check."""
    result = {
        "blocks_check": False,
        "evades_check": False,
        "checking_piece": None,
    }
    
    if not board.is_check():
        return result
    
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return result
    
    # Get the checking piece(s)
    king_sq = board.king(board.turn)
    if king_sq is None:
        return result
    
    checkers = board.attackers(not board.turn, king_sq)
    if checkers:
        first_checker = list(checkers)[0]
        checker_piece = board.piece_at(first_checker)
        if checker_piece:
            result["checking_piece"] = _get_piece_name(checker_piece)
    
    # Is it a king move?
    if moving_piece.piece_type == chess.KING:
        result["evades_check"] = True
    else:
        result["blocks_check"] = True
    
    return result


def _piece_escapes_attack(board: chess.Board, move: chess.Move) -> bool:
    """Check if the move moves a piece out of attack."""
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return False
    
    from_sq = move.from_square
    opponent_color = not moving_piece.color
    
    # Was the piece attacked on its original square?
    attackers = board.attackers(opponent_color, from_sq)
    if not attackers:
        return False
    
    # Make the move and check if the piece is now safe
    test_board = board.copy()
    test_board.push(move)
    
    new_attackers = test_board.attackers(opponent_color, move.to_square)
    
    # Piece escaped if there were attackers before and fewer/none now
    return len(new_attackers) < len(attackers)


def _is_pawn_to_center(board: chess.Board, move: chess.Move) -> bool:
    """Check if a pawn moves to a central square."""
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece or moving_piece.piece_type != chess.PAWN:
        return False
    
    central_squares = {chess.D4, chess.D5, chess.E4, chess.E5, chess.C4, chess.C5, chess.F4, chess.F5}
    return move.to_square in central_squares


def extract_chesscom_facts(
    fen: str,
    move_san: Optional[str] = None,
    move_uci: Optional[str] = None,
    heuristics: Optional[Dict[str, Any]] = None,
    engine_data: Optional[Dict[str, Any]] = None,
    prev_fen: Optional[str] = None,
    is_book_move: bool = False,
    move_classification: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract facts needed for Chess.com-style commentary rules.
    
    Args:
        fen: Current position FEN (after the move)
        move_san: The move in SAN notation
        move_uci: The move in UCI notation
        heuristics: Existing heuristics dict
        engine_data: Stockfish analysis data
        prev_fen: Previous position FEN (before the move)
        is_book_move: Whether this is a book/theory move
        move_classification: Move quality (best, good, inaccuracy, mistake, blunder)
    
    Returns:
        Dict with extracted facts for rule matching
    """
    facts: Dict[str, Any] = {}
    heuristics = heuristics or {}
    engine_data = engine_data or {}
    
    # Parse positions
    try:
        board = chess.Board(fen)
    except Exception:
        return facts
    
    prev_board = None
    if prev_fen:
        try:
            prev_board = chess.Board(prev_fen)
        except Exception:
            pass
    
    # Parse the move
    move = None
    if move_uci and prev_board:
        try:
            move = chess.Move.from_uci(move_uci)
        except Exception:
            pass
    elif move_san and prev_board:
        try:
            move = prev_board.parse_san(move_san)
        except Exception:
            pass
    
    # Get the side that just moved
    side_to_move = board.turn
    just_moved = not side_to_move  # The side that made the last move
    
    # =========================================================================
    # ROOK COORDINATION
    # =========================================================================
    facts["rooks_connected"] = _are_rooks_connected(board, just_moved)
    
    # =========================================================================
    # BOOK MOVE
    # =========================================================================
    facts["is_book_move"] = is_book_move
    
    # =========================================================================
    # MOVE CLASSIFICATION FACTS
    # =========================================================================
    if move_classification:
        facts["move_classification"] = move_classification
        facts["is_not_best_move"] = move_classification not in ["best", "brilliant"]
        facts["in_top_three_moves"] = move_classification in ["best", "excellent", "good"]
        facts["missed_winning_move"] = move_classification in ["miss", "blunder"]
    
    # =========================================================================
    # ENGINE-DERIVED FACTS
    # =========================================================================
    cp_delta = engine_data.get("cp_delta") or engine_data.get("eval_loss")
    if cp_delta is not None:
        facts["engine_cp_delta"] = abs(cp_delta)
        facts["only_good_move"] = abs(cp_delta) < 20 and move_classification == "best"
    
    mate = engine_data.get("mate")
    if mate is not None:
        facts["continues_mate_threat"] = True
    
    # Check if engine shows a critical position
    facts["is_critical_position"] = (
        mate is not None or 
        (cp_delta is not None and abs(cp_delta) > 150)
    )
    
    # =========================================================================
    # MOVE-SPECIFIC FACTS (require move and prev_board)
    # =========================================================================
    if move and prev_board:
        # Capture facts
        facts["is_capture"] = prev_board.is_capture(move)
        if facts["is_capture"]:
            facts["capture_value_delta"] = _get_capture_value_delta(prev_board, move)
            
            hanging = _is_hanging_capture(prev_board, move)
            facts["captured_hanging_piece"] = hanging["is_hanging"]
            if hanging["captured_piece"]:
                facts["captured_piece"] = hanging["captured_piece"]
        
        # Kicking piece
        kick_info = _threatens_piece_must_move(prev_board, move)
        facts["threatens_piece_must_move"] = kick_info["threatens"]
        if kick_info["target_piece"]:
            facts["target_piece"] = kick_info["target_piece"]
        
        # Defends piece
        defend_info = _defends_attacked_piece(prev_board, move)
        facts["defends_attacked_piece"] = defend_info["defends"]
        if defend_info["defended_piece"]:
            facts["defended_piece"] = defend_info["defended_piece"]
        
        # Check handling
        check_info = _blocks_or_evades_check(prev_board, move)
        facts["blocks_check"] = check_info["blocks_check"]
        facts["king_evades_check"] = check_info["evades_check"]
        if check_info["checking_piece"]:
            facts["checking_piece"] = check_info["checking_piece"]
        
        # Piece escapes attack
        facts["piece_escapes_attack"] = _piece_escapes_attack(prev_board, move)
        
        # Pawn to center
        facts["pawn_to_center"] = _is_pawn_to_center(prev_board, move)
        
        # Queen retreat
        moving_piece = prev_board.piece_at(move.from_square)
        if moving_piece and moving_piece.piece_type == chess.QUEEN:
            # Check if queen was attacked and moved to safety
            if facts.get("piece_escapes_attack"):
                facts["queen_retreated_to_safety"] = True
    
    # =========================================================================
    # PASSED PAWN FACTS
    # =========================================================================
    # Check for passed pawn advance
    if heuristics.get("passed_pawns"):
        passed = heuristics["passed_pawns"]
        if isinstance(passed, list) and len(passed) > 0:
            # Check if a passed pawn moved
            if move and prev_board:
                from_piece = prev_board.piece_at(move.from_square)
                if from_piece and from_piece.piece_type == chess.PAWN:
                    from_sq_name = chess.square_name(move.from_square)
                    if any(pp.get("square") == from_sq_name for pp in passed if isinstance(pp, dict)):
                        facts["passed_pawn_pushed"] = True
    
    # =========================================================================
    # GAME PHASE
    # =========================================================================
    # Simple game phase detection
    total_pieces = len(board.piece_map())
    if total_pieces > 24:
        facts["game_phase"] = "opening"
    elif total_pieces > 12:
        facts["game_phase"] = "middlegame"
    else:
        facts["game_phase"] = "endgame"
        
        # King activation in endgame
        king_sq = board.king(just_moved)
        if king_sq:
            king_rank = chess.square_rank(king_sq)
            # King is active if not on back rank
            if (just_moved == chess.WHITE and king_rank > 0) or \
               (just_moved == chess.BLACK and king_rank < 7):
                facts["king_activated"] = True
    
    return facts
