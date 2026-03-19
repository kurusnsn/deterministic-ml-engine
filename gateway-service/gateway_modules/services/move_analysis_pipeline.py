"""
Move analysis pipeline for analyzing all moves in a game.
"""

import chess
import chess.pgn
from io import StringIO
from typing import List, Dict, Any, Optional
from .opening_analyzer import NormalizedGame, determine_user_color_and_result
from .move_evaluation_service import evaluate_move_with_stockfish
from .mistake_detection_service import classify_mistake
from .heuristics_service import calculate_position_heuristics
import asyncpg


async def analyze_game_moves(
    game: NormalizedGame,
    user_identifier: str,
    stockfish_url: str,
    pool: Optional[asyncpg.Pool] = None,
    max_moves: Optional[int] = 40,
    progress_callback: Optional[callable] = None
) -> List[Dict[str, Any]]:
    """
    Analyze all moves in a game with engine evaluation and heuristics.

    Args:
        game: NormalizedGame object
        user_identifier: Username to determine user's color
        stockfish_url: URL of Stockfish service
        pool: Optional database pool for caching
        max_moves: Maximum number of moves to analyze (default 40)

    Returns:
        List of move analysis dictionaries matching section 1.1 structure
    """
    if not game.pgn:
        return []

    try:
        # Parse PGN
        pgn_io = StringIO(game.pgn)
        chess_game = chess.pgn.read_game(pgn_io)
        
        if chess_game is None:
            return []

        # Determine user color
        user_color, _ = determine_user_color_and_result(game, user_identifier)
        if user_color is None:
            return []

        # Build board and analyze moves
        board = chess.Board()
        move_analyses = []
        ply = 1
        prev_eval_cp = 0  # Assume starting position is equal

        node = chess_game
        total_moves = min(len(list(chess_game.mainline_moves())), max_moves or 999)
        move_count = 0
        
        while node and (max_moves is None or ply <= max_moves):
            node = node.variation(0) if node.variations else None
            if node is None or node.move is None:
                break

            # Get FEN before move
            fen_before = board.fen()

            # Make move
            board.push(node.move)
            fen_after = board.fen()

            # Only analyze moves for the user's color
            is_user_move = (ply % 2 == 1 and user_color == "white") or (ply % 2 == 0 and user_color == "black")
            
            if is_user_move:
                move_count += 1
                
                # Report progress
                if progress_callback:
                    try:
                        if callable(progress_callback):
                            await progress_callback({
                                "type": "move_analysis",
                                "game_id": str(game.id),
                                "move": move_count,
                                "total": total_moves,
                                "message": f"Analyzing move {move_count}/{total_moves}..."
                            })
                    except Exception as e:
                        # Progress callback failure shouldn't stop analysis
                        print(f"Progress callback failed: {e}")
                # Evaluate position after move
                eval_data = await evaluate_move_with_stockfish(fen_after, depth=12, pool=pool)
                
                # Calculate eval delta
                eval_after_cp = eval_data.get("cp", 0)
                eval_delta = eval_after_cp - prev_eval_cp
                
                # Classify mistake
                mistake_data = classify_mistake(prev_eval_cp, eval_after_cp)
                
                # Debug: Log any significant mistakes
                if mistake_data.get("mistake_type"):
                    print(f"[MoveAnalysis] Game {game.id} ply {ply}: {mistake_data['mistake_type']} (delta: {eval_delta}cp)")
                
                # Calculate heuristics
                heuristics_data = calculate_position_heuristics(fen_after, board)
                
                # Build move analysis
                move_analysis = {
                    "ply": ply,
                    "move": node.san(),
                    "user_color": user_color,  # Which color the user played as in this game
                    "fen_before": fen_before,
                    "fen_after": fen_after,
                    "eval": {
                        "cp": eval_data.get("cp", 0),
                        "depth": eval_data.get("depth", 0),
                        "mate": eval_data.get("mate")
                    },
                    "eval_delta": eval_delta,
                    "mistake_type": mistake_data.get("mistake_type"),
                    "best_move": eval_data.get("best_move", ""),
                    "pv": eval_data.get("pv", []),
                    "heuristics": heuristics_data
                }
                
                move_analyses.append(move_analysis)
                
                # Update previous eval for next move
                prev_eval_cp = eval_after_cp
            else:
                # Skip engine call for opponent moves to reduce load; keep previous eval as baseline
                # This halves Stockfish requests (only user's moves are evaluated)
                pass

            # Increment ply after each move to alternate turns and honor max_moves limit
            ply += 1

        return move_analyses
    except Exception as e:
        print(f"Error analyzing moves for game {game.id}: {e}")
        return []
