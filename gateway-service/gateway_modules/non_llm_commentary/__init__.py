"""
Non-LLM Commentary Module.

Deterministic, YAML-driven chess commentary system.
Feature-flagged behind ENABLE_NON_LLM_COMMENTARY=1.

Usage:
    from gateway_modules.non_llm_commentary import generate_non_llm_commentary
    
    result = generate_non_llm_commentary(
        heuristics=heuristics_dict,
        position_facts=position_facts_dict,
        move_san="Nxf7",
        verbosity=2
    )
"""

from .config import ENABLE_NON_LLM_COMMENTARY, VERBOSITY_LEVEL


def generate_non_llm_commentary(
    heuristics: dict,
    position_facts: dict = None,
    move_san: str = None,
    fen: str = None,
    verbosity: int = None,
    prev_fen: str = None,
    move_uci: str = None,
    engine_data: dict = None,
    move_classification: str = None,
    is_book_move: bool = False,
) -> dict | None:
    """
    Generate non-LLM commentary for a chess position/move.
    
    Args:
        heuristics: Dict of computed heuristics from heuristics_service
        position_facts: Optional dict of position facts
        move_san: Optional SAN of the move played
        fen: Optional FEN string (after move)
        verbosity: Override verbosity level (0-4)
        prev_fen: Optional previous FEN (before move) - for Chess.com patterns
        move_uci: Optional UCI move string - for Chess.com patterns
        engine_data: Optional engine analysis data - for Chess.com patterns
        move_classification: Move quality (best, good, mistake, etc.) - for Chess.com patterns
        is_book_move: Whether this is a book/theory move - for Chess.com patterns
    
    Returns:
        Dict with commentary output, or None if disabled/no commentary
        
    Output schema:
        {
            "label": "excellent",
            "text": "This move creates a skewer.",
            "confidence": 0.91,
            "idea": "SKEWER",
            "affordances": [
                {
                    "type": "HIGHLIGHT",
                    "pattern": "skewer",
                    "squares": ["e1", "e8"]
                }
            ]
        }
    """
    if not ENABLE_NON_LLM_COMMENTARY:
        return None
    
    from .rule_engine import evaluate_rules
    from .arbitration import arbitrate_rules
    from .affordances import generate_affordances
    from .serializers import serialize_commentary
    
    verbosity = verbosity if verbosity is not None else VERBOSITY_LEVEL
    
    # Evaluate all rules against current facts (with Chess.com-style detection)
    matching_rules = evaluate_rules(
        heuristics=heuristics,
        position_facts=position_facts,
        move_san=move_san,
        fen=fen,
        prev_fen=prev_fen,
        move_uci=move_uci,
        engine_data=engine_data,
        move_classification=move_classification,
        is_book_move=is_book_move,
    )
    
    # Arbitrate to select best rule
    selected_rule = arbitrate_rules(matching_rules, verbosity=verbosity)
    
    if selected_rule is None:
        return None
    
    # Generate UI affordances
    affordances = generate_affordances(
        rule=selected_rule,
        heuristics=heuristics,
    )
    
    # Serialize to output schema
    return serialize_commentary(
        rule=selected_rule,
        affordances=affordances,
        heuristics=heuristics,
    )


__all__ = ["generate_non_llm_commentary", "ENABLE_NON_LLM_COMMENTARY"]
