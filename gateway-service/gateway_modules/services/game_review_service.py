"""
Game Review Service - Engine Annotations Builder.

Transforms move analysis data into UI-friendly annotations for the game review page.
Uses existing services (mistake_detection_service, position_evaluation_service, heuristics_service)
without re-implementing any engine analysis logic.
"""

import chess
from typing import Dict, Any, List, Optional
from .mistake_detection_service import classify_mistake
from .heuristics_service import calculate_position_heuristics
from .position_evaluation_service import evaluate_position_from_heuristics


# Classification mapping based on eval delta (from the moving player's perspective)
# eval_delta is calculated as: eval_after - eval_before (for white) or inverse for black
# So: positive eval_delta = position maintained/improved, negative = position worsened
#
# The thresholds classify based on how much advantage was lost:
# - Moves that maintain the position value are "best" or "excellent"
# - Moves that slightly worsen position are "good" or "inaccuracy"  
# - Moves that significantly worsen position are "mistake", "miss", or "blunder"
#
# Note: "brilliant" and "great" require special conditions (sacrifice, only good move)
# and are handled separately with stricter gates.
CLASSIFICATION_THRESHOLDS = [
    # (min_delta, max_delta, classification)
    # Excellent / Best moves: minimal or no loss
    (-10, float('inf'), "best"),          # Lost 0-10 cp or improved position
    (-30, -10, "excellent"),              # Lost 10-30 cp (very close to best)
    (-50, -30, "good"),                   # Lost 30-50 cp (reasonable move)
    # Suboptimal moves
    (-100, -50, "inaccuracy"),            # Lost 50-100 cp (small mistake)
    (-200, -100, "mistake"),              # Lost 100-200 cp (moderate error)
    (-300, -200, "miss"),                 # Lost 200-300 cp (major error)
    (float('-inf'), -300, "blunder"),     # Lost 300+ cp (critical blunder)
]




def classify_move_type(
    eval_delta: int, 
    is_book_move: bool = False,
    fen_before: str = None,
    fen_after: str = None,
    move_san: str = None
) -> Optional[str]:
    """
    Classify a move based on evaluation delta with strict brilliant detection.
    
    Args:
        eval_delta: Centipawn difference (negative = lost advantage)
        is_book_move: Whether this is a known opening book move
        fen_before: FEN before the move (for material calculation)
        fen_after: FEN after the move (for material calculation)
        move_san: Move in SAN notation (for trade detection)
    
    Returns:
        Classification string or None
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if is_book_move:
        return "book"
    
    # =========================================================================
    # INVARIANT ASSERTION: Sanity check eval_delta
    # =========================================================================
    if abs(eval_delta) >= 2000:
        logger.warning(
            f"SUSPICIOUS eval_delta={eval_delta}cp (>2000). "
            f"Check if Stockfish output is being parsed correctly."
        )
    
    delta = eval_delta
    
    # =========================================================================
    # BRILLIANT DETECTION (strict rules - only for sacrifice moves)
    # =========================================================================
    # A brilliant move is a sacrifice (losing material) that is still the best move
    # We check: delta >= -10 (best move category) AND the move is a material sacrifice
    is_best_or_excellent = delta >= -30  # Within excellent range
    
    if is_best_or_excellent and fen_before and fen_after:
        try:
            import chess
            board_before = chess.Board(fen_before)
            board_after = chess.Board(fen_after)
            
            # Calculate material for both sides
            PIECE_VALUES = {
                chess.PAWN: 100, chess.KNIGHT: 320, chess.BISHOP: 330,
                chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0
            }
            
            def count_material(board: chess.Board, color: bool) -> int:
                total = 0
                for piece_type in PIECE_VALUES:
                    total += len(board.pieces(piece_type, color)) * PIECE_VALUES[piece_type]
                return total
            
            # Material from perspective of side that moved
            side_that_moved = not board_after.turn
            
            my_material_before = count_material(board_before, side_that_moved)
            my_material_after = count_material(board_after, side_that_moved)
            opp_material_before = count_material(board_before, not side_that_moved)
            opp_material_after = count_material(board_after, not side_that_moved)
            
            my_material_delta = my_material_after - my_material_before
            opp_material_delta = opp_material_after - opp_material_before
            relative_material_delta = my_material_delta - opp_material_delta
            
            # Detect queen trade (never brilliant)
            queens_before = len(board_before.pieces(chess.QUEEN, chess.WHITE)) + \
                           len(board_before.pieces(chess.QUEEN, chess.BLACK))
            queens_after = len(board_after.pieces(chess.QUEEN, chess.WHITE)) + \
                          len(board_after.pieces(chess.QUEEN, chess.BLACK))
            is_queen_trade = queens_before == 2 and queens_after == 0
            
            # Sacrifice: I lost more material than opponent
            is_sacrifice = relative_material_delta < -50  # Lost at least 0.5 pawns net
            
            # Brilliant: sacrifice move that is still best
            if is_sacrifice and not is_queen_trade and delta >= -10:
                logger.debug(f"Brilliant move detected: {move_san}, sacrifice={relative_material_delta}cp, eval_delta={delta}cp")
                return "brilliant"
            
            # Great: sacrifice move that is still excellent
            if is_sacrifice and not is_queen_trade and delta >= -30:
                return "great"
                    
        except Exception as e:
            logger.warning(f"Error in brilliant detection: {e}")
            # Fall through to normal classification
    
    # =========================================================================
    # STANDARD CLASSIFICATION (based on eval_delta thresholds)
    # =========================================================================
    for min_val, max_val, classification in CLASSIFICATION_THRESHOLDS:
        if min_val <= delta < max_val:
            return classification
    
    return "good"  # Default



def uci_to_san(board: chess.Board, uci_moves: List[str]) -> List[str]:
    """
    Convert a list of UCI moves to SAN notation.
    
    Args:
        board: Current board position
        uci_moves: List of UCI move strings
    
    Returns:
        List of SAN move strings
    """
    san_moves = []
    temp_board = board.copy()
    
    for uci in uci_moves:
        try:
            move = chess.Move.from_uci(uci)
            if move in temp_board.legal_moves:
                san = temp_board.san(move)
                san_moves.append(san)
                temp_board.push(move)
            else:
                # Move is not legal, stop conversion
                break
        except (ValueError, chess.InvalidMoveError):
            break
    
    return san_moves


def build_move_review_annotations(
    move_analyses: List[Dict[str, Any]],
    include_heuristics: bool = True
) -> List[Dict[str, Any]]:
    """
    Build UI-friendly annotations from move analysis data.
    
    This function transforms the raw move analysis data (already computed by
    the /analysis/game endpoint) into a format suitable for the game review UI.
    
    Args:
        move_analyses: List of move analysis dicts from analyze_game_accuracy_elo()
                      Each contains: ply, move, fen_before, fen_after, eval, prev_eval,
                      best_move, pv
        include_heuristics: Whether to compute heuristic position evaluation
    
    Returns:
        List of annotation dicts with fields:
        - ply_index: int
        - move_san: str
        - side_to_move: "white" | "black"
        - eval_cp: int
        - eval_delta: int
        - mistake_type: str | None
        - best_move_uci: str | None
        - best_move_san: str | None
        - pv_uci: list[str] | None
        - pv_san: list[str] | None
        - better_move_exists: bool
        - heuristic_summary: dict | None
    """
    annotations = []
    
    # DIAGNOSTIC: Log input summary
    print(f"[DIAGNOSTIC build_move_review_annotations] Processing {len(move_analyses)} moves")
    
    for analysis in move_analyses:
        ply = analysis.get("ply", 0)
        move_san = analysis.get("move", "")
        fen_before = analysis.get("fen_before", "")
        fen_after = analysis.get("fen_after", "")
        
        # Extract evaluation data
        eval_data = analysis.get("eval", {})
        prev_eval = analysis.get("prev_eval", {})
        
        eval_cp = eval_data.get("cp", 0)
        prev_cp = prev_eval.get("cp", 0)
        
        # Handle mate scores
        if eval_data.get("mate") is not None:
            mate_in = eval_data["mate"]
            eval_cp = 10000 if mate_in > 0 else -10000
        if prev_eval.get("mate") is not None:
            mate_in = prev_eval["mate"]
            prev_cp = 10000 if mate_in > 0 else -10000
        
        # Calculate eval delta (from perspective of side that moved)
        # Odd ply = white moved, even ply = black moved
        side_to_move = "white" if ply % 2 == 1 else "black"
        
        # Eval delta: positive = good for the side that moved
        # Stockfish gives eval from white's perspective
        if side_to_move == "white":
            eval_delta = (eval_cp or 0) - (prev_cp or 0)
        else:
            # For black, we invert: if eval went from +1 to +0.5, that's good for black (+50cp)
            eval_delta = (prev_cp or 0) - (eval_cp or 0)
        
        # Extract best move and PV
        best_move_uci = analysis.get("best_move", "")
        pv_uci = analysis.get("pv", [])
        
        # Convert to SAN if we have a valid position
        best_move_san = None
        pv_san = []
        
        try:
            if fen_before and best_move_uci:
                board = chess.Board(fen_before)
                # Best move is for the position AFTER the played move
                # So we need to use fen_after
                board_after = chess.Board(fen_after)
                
                # Convert best move to SAN
                try:
                    best_move = chess.Move.from_uci(best_move_uci)
                    if best_move in board_after.legal_moves:
                        best_move_san = board_after.san(best_move)
                except (ValueError, chess.InvalidMoveError):
                    pass
                
                # Convert PV to SAN
                if pv_uci:
                    pv_san = uci_to_san(board_after, pv_uci)
        except Exception:
            pass
        
        # Determine if a better move exists
        # A better move exists if the eval_delta is significantly negative
        # AND the best_move is different from what was played
        better_move_exists = eval_delta < -20 and bool(best_move_san)
        
        # Classify the move (with strict brilliant detection)
        mistake_type = classify_move_type(
            eval_delta=eval_delta,
            fen_before=fen_before,
            fen_after=fen_after,
            move_san=move_san
        )

        
        # Also check using the existing classify_mistake function for consistency
        mistake_result = classify_mistake(prev_cp or 0, eval_cp or 0)
        backend_mistake_type = mistake_result.get("mistake_type")
        
        # DIAGNOSTIC: Log first 5 moves evaluation data
        if ply <= 5:
            print(f"[DIAGNOSTIC] Move {ply} ({move_san}): "
                  f"prev_cp={prev_cp}, eval_cp={eval_cp}, "
                  f"eval_delta={eval_delta}, "
                  f"classify_move_type={mistake_type}, "
                  f"classify_mistake={backend_mistake_type}")
        
        # Use backend classification if it's more severe
        if backend_mistake_type in ["blunder", "mistake", "inaccuracy", "missed_win"]:
            if backend_mistake_type == "missed_win":
                mistake_type = "miss"
            else:
                mistake_type = backend_mistake_type
        
        # Build heuristic summary if requested
        heuristic_summary = None
        if include_heuristics and fen_after:
            try:
                board = chess.Board(fen_after)
                heuristics = calculate_position_heuristics(fen_after, board)
                white_to_move = board.turn == chess.WHITE
                heuristic_eval = evaluate_position_from_heuristics(
                    heuristics,
                    white_to_move=white_to_move,
                    fen=fen_after,
                    board=board
                )
                heuristic_summary = {
                    "advantage": heuristic_eval.get("advantage", "equal"),
                    "commentary": heuristic_eval.get("commentary", ""),
                    "white_score": heuristic_eval.get("white_score", 0),
                    "black_score": heuristic_eval.get("black_score", 0),
                    "eval": heuristic_eval.get("eval", 0)
                }
            except Exception as e:
                print(f"Error computing heuristics for ply {ply}: {e}")
        
        annotation = {
            "ply_index": ply,
            "move_san": move_san,
            "side_to_move": side_to_move,
            "eval_cp": eval_cp,
            "eval_delta": eval_delta,
            "mistake_type": mistake_type,
            "best_move_uci": best_move_uci if best_move_uci else None,
            "best_move_san": best_move_san,
            "pv_uci": pv_uci if pv_uci else None,
            "pv_san": pv_san if pv_san else None,
            "better_move_exists": better_move_exists,
            "heuristic_summary": heuristic_summary
        }
        
        annotations.append(annotation)
    
    return annotations
