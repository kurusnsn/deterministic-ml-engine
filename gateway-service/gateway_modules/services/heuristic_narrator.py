"""
Fact-Grounded Heuristic Narrator - Move-Focused Commentary

NOTE: This is a structural snapshot stub. Proprietary natural-language 
move commentary and tactic classification logic has been removed.
"""

from typing import Dict, Any, Optional

def render_non_llm_commentary(
    heuristics: Dict[str, Any],
    ply_count: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
    fen: Optional[str] = None,
    move_facts: Optional[Dict[str, Any]] = None,
    last_move_san: Optional[str] = None,
    engine: Optional[Dict[str, Any]] = None,
    opening: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Stubbed non-LLM commentary renderer."""
    return {
        "headline": "Move Played",
        "text": "Fallback engine commentary is disabled in this snapshot.",
        "tags": ["stubbed"],
        "evidence": {},
        "sentence_count": 1,
    }

def render_commentary_from_heuristics(
    heuristics: Dict[str, Any],
    tier: str,
    ply_count: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
    fen: Optional[str] = None,
    move_facts: Optional[Dict[str, Any]] = None,
    last_move_san: Optional[str] = None,
    engine: Optional[Dict[str, Any]] = None,
    opening: Optional[Dict[str, Any]] = None,
) -> str:
    """Stubbed text extraction."""
    return "Fallback engine commentary is disabled in this snapshot."

def render_commentary_from_context(context) -> Dict[str, Any]:
    """Stubbed context rendering."""
    return render_non_llm_commentary({})
