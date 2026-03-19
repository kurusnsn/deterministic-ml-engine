"""
Commentary Context - Shared data structure for LLM and non-LLM commentary.

This module defines the CommentaryContext dataclass which holds all inputs
used by both the LLM and heuristic commentators. This ensures both systems
have access to the same computed facts, preventing discrepancies.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass(frozen=True)
class CommentaryContext:
    """
    Shared context for all commentary generation.
    
    This is the single source of truth for commentary inputs.
    Both LLM and non-LLM narrators consume this same structure.
    
    Attributes:
        fen_before: FEN string before the move was made
        fen_after: FEN string after the move was made
        ply_count: Number of half-moves played (0 = starting position)
        last_move_san: The move that was just played in SAN notation
        move_facts: Computed facts about the move (from compute_move_facts)
        heuristics: Position heuristics (from calculate_position_heuristics)
        engine: Engine evaluation data
        opening: Opening book information
        meta: Game context metadata
    """
    
    # Position state
    fen_before: str
    fen_after: str
    
    # Move information
    ply_count: Optional[int] = None
    last_move_san: Optional[str] = None
    
    # Computed move facts (captures, attacks, defends, hangings, etc.)
    move_facts: Optional[Dict[str, Any]] = None
    
    # Position heuristics (tension, trapped, pawn structure, etc.)
    heuristics: Dict[str, Any] = field(default_factory=dict)
    
    # Engine evaluation
    # {"display_eval": str|None, "best_move": str|None, "depth": int|None}
    engine: Dict[str, Any] = field(default_factory=dict)
    
    # Opening information
    # {"eco_code": str|None, "name": str|None}
    opening: Dict[str, Any] = field(default_factory=dict)
    
    # Game metadata
    # {"game_phase": "opening|middlegame|endgame", ...}
    meta: Dict[str, Any] = field(default_factory=dict)
    
    def get_game_phase(self) -> str:
        """Get the game phase from meta or heuristics."""
        # Try meta first
        if self.meta.get("game_phase"):
            return self.meta["game_phase"]
        
        # Try heuristics position_facts
        position_facts = self.heuristics.get("position_facts", {})
        if position_facts.get("phase"):
            return position_facts["phase"]
        
        # Default based on ply count
        if self.ply_count is not None:
            if self.ply_count <= 20:
                return "opening"
            elif self.ply_count <= 60:
                return "middlegame"
            else:
                return "endgame"
        
        return "middlegame"
    
    def has_engine_eval(self) -> bool:
        """Check if engine evaluation is available."""
        return bool(self.engine.get("display_eval"))
    
    def has_opening_info(self) -> bool:
        """Check if opening information is available."""
        return bool(self.opening.get("name") or self.opening.get("eco_code"))
    
    def has_move_facts(self) -> bool:
        """Check if move facts are available."""
        return self.move_facts is not None and "error" not in self.move_facts
