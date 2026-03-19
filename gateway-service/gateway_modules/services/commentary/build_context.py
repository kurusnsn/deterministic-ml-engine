"""
Commentary Context Builder - Assembles CommentaryContext from various sources.

This module provides the build_commentary_context function which creates
a CommentaryContext by computing move facts and gathering all required data.
"""

from typing import Optional, Dict, Any
import chess

from .context import CommentaryContext


def build_commentary_context(
    fen_before: str,
    fen_after: str,
    ply_count: Optional[int] = None,
    last_move_san: Optional[str] = None,
    move_from: Optional[str] = None,
    move_to: Optional[str] = None,
    heuristics: Optional[Dict[str, Any]] = None,
    engine_eval: Optional[str] = None,
    best_move: Optional[str] = None,
    depth: Optional[int] = None,
    eco_code: Optional[str] = None,
    opening_name: Optional[str] = None,
    compute_move_facts_fn: Optional[callable] = None,
) -> CommentaryContext:
    """
    Build a CommentaryContext from provided data.
    
    This is the single entry point for creating commentary context.
    It computes move_facts once and assembles all data into a unified structure.
    
    Args:
        fen_before: FEN before the move
        fen_after: FEN after the move
        ply_count: Number of half-moves played
        last_move_san: The move in SAN notation
        move_from: Source square (e.g., "e2")
        move_to: Destination square (e.g., "e4")
        heuristics: Pre-computed position heuristics
        engine_eval: Display evaluation string (e.g., "+0.45", "Mate in 3")
        best_move: Engine's recommended move in SAN
        depth: Engine analysis depth
        eco_code: ECO code (e.g., "C50")
        opening_name: Opening name (e.g., "Italian Game")
        compute_move_facts_fn: Optional function to compute move facts
            (if not provided, move_facts will be None)
    
    Returns:
        CommentaryContext with all available data
    """
    # Initialize with safe defaults
    move_facts: Optional[Dict[str, Any]] = None
    heuristics = heuristics or {}
    
    # Compute move facts if we have the required data and function
    if (compute_move_facts_fn and 
        fen_before and fen_after and 
        move_from and move_to and last_move_san):
        try:
            move_facts = compute_move_facts_fn(
                fen_before, fen_after, move_from, move_to, last_move_san
            )
            # Only use if no error
            if move_facts and "error" in move_facts:
                move_facts = None
        except Exception:
            move_facts = None
    
    # Build engine dict
    engine: Dict[str, Any] = {}
    if engine_eval is not None:
        engine["display_eval"] = engine_eval
    if best_move is not None:
        engine["best_move"] = best_move
    if depth is not None:
        engine["depth"] = depth
    
    # Build opening dict
    opening: Dict[str, Any] = {}
    if eco_code:
        opening["eco_code"] = eco_code
    if opening_name:
        opening["name"] = opening_name
    
    # Build meta dict from heuristics
    meta: Dict[str, Any] = {}
    
    # Extract phase from position_facts if available
    position_facts = heuristics.get("position_facts", {})
    if position_facts.get("phase"):
        meta["game_phase"] = position_facts["phase"]
    elif ply_count is not None:
        # Fallback phase detection
        if ply_count <= 20:
            meta["game_phase"] = "opening"
        elif ply_count <= 60:
            meta["game_phase"] = "middlegame"
        else:
            meta["game_phase"] = "endgame"
    
    # Copy other meta info if available
    if position_facts.get("castling"):
        meta["castling"] = position_facts["castling"]
    if position_facts.get("threats"):
        meta["threats"] = position_facts["threats"]
    
    # Add ECO to meta for backward compatibility
    if eco_code or opening_name:
        meta["eco"] = {"code": eco_code, "name": opening_name}
    
    return CommentaryContext(
        fen_before=fen_before,
        fen_after=fen_after,
        ply_count=ply_count,
        last_move_san=last_move_san,
        move_facts=move_facts,
        heuristics=heuristics,
        engine=engine,
        opening=opening,
        meta=meta,
    )


def build_commentary_context_from_analysis(
    fen_before: str,
    fen_after: str,
    last_move_san: Optional[str] = None,
    move_from: Optional[str] = None,
    move_to: Optional[str] = None,
    stockfish_info: Optional[Dict[str, Any]] = None,
    eco_info: Optional[Dict[str, Any]] = None,
    heuristics: Optional[Dict[str, Any]] = None,
    ply_count: Optional[int] = None,
    compute_move_facts_fn: Optional[callable] = None,
) -> CommentaryContext:
    """
    Build CommentaryContext from typical analysis endpoint data.
    
    This is a convenience wrapper that extracts engine and ECO data
    from their typical response formats.
    
    Args:
        fen_before: FEN before the move
        fen_after: FEN after the move
        last_move_san: The move in SAN notation
        move_from: Source square
        move_to: Destination square
        stockfish_info: Stockfish analysis response
        eco_info: ECO lookup response
        heuristics: Position heuristics
        ply_count: Ply count
        compute_move_facts_fn: Function to compute move facts
    
    Returns:
        CommentaryContext
    """
    stockfish_info = stockfish_info or {}
    eco_info = eco_info or {}
    
    # Extract engine evaluation
    evaluation = stockfish_info.get("evaluation", {})
    eval_cp = evaluation.get("cp")
    eval_mate = evaluation.get("mate")
    
    if eval_mate is not None:
        display_eval = f"Mate in {abs(eval_mate)}"
    elif eval_cp is not None:
        display_eval = f"{eval_cp / 100.0:+.2f}"
    else:
        display_eval = None
    
    best_move = stockfish_info.get("best_move")
    depth = stockfish_info.get("depth")
    
    # Extract ECO info
    eco_code = eco_info.get("eco", "")
    opening_name = eco_info.get("name", "")
    
    return build_commentary_context(
        fen_before=fen_before,
        fen_after=fen_after,
        ply_count=ply_count,
        last_move_san=last_move_san,
        move_from=move_from,
        move_to=move_to,
        heuristics=heuristics,
        engine_eval=display_eval,
        best_move=best_move,
        depth=depth,
        eco_code=eco_code,
        opening_name=opening_name,
        compute_move_facts_fn=compute_move_facts_fn,
    )
