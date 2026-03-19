"""
Serializers for Non-LLM Commentary.

Converts selected rules and affordances to the output schema.
"""

import hashlib
import random
from typing import Dict, Any, List, Optional


def _select_template_deterministic(
    templates: List[str],
    fen: str = None,
    rule_id: str = None,
) -> str:
    """
    Select a template deterministically based on FEN hash.
    
    This ensures the same position always gets the same template.
    """
    if not templates:
        return ""
    
    if len(templates) == 1:
        return templates[0]
    
    # Use FEN + rule_id for deterministic selection
    seed_str = f"{fen or 'no_fen'}:{rule_id or 'no_rule'}"
    hash_val = int(hashlib.md5(seed_str.encode()).hexdigest(), 16)
    index = hash_val % len(templates)
    
    return templates[index]


def _interpolate_template(
    template: str,
    heuristics: Dict[str, Any],
    facts: Dict[str, Any] = None,
) -> str:
    """
    Interpolate template variables like {fork_targets}, {piece}, etc.
    """
    facts = facts or {}
    
    # Build interpolation context
    context = {}
    
    # Fork targets
    fork_data = heuristics.get("fork_data", {})
    if fork_data.get("forked_squares"):
        targets = fork_data["forked_squares"]
        context["fork_targets"] = " and ".join(targets) if len(targets) <= 2 else ", ".join(targets)
    
    # Pinned piece
    pin_data = heuristics.get("pin_data", {})
    if pin_data.get("pinned_piece"):
        context["pinned_piece"] = _piece_name(pin_data["pinned_piece"])
    
    # Moved piece
    if facts.get("move_san"):
        san = facts["move_san"]
        if san[0].isupper():
            context["moved_piece"] = _piece_name(san[0])
            context["piece"] = context["moved_piece"]
        else:
            context["moved_piece"] = "pawn"
            context["piece"] = "pawn"
    
    # Squares
    if facts.get("passed_pawn_square"):
        context["square"] = facts["passed_pawn_square"]
    elif heuristics.get("position_facts", {}).get("outposts"):
        context["square"] = heuristics["position_facts"]["outposts"][0]
    
    # Files
    open_files = heuristics.get("position_facts", {}).get("open_files", [])
    if open_files:
        context["file"] = open_files[0]
    
    # Diagonal
    context["diagonal"] = "long"  # Default
    
    # Mate in N
    tension = heuristics.get("tension", {})
    if tension.get("mate_in"):
        context["mate_in"] = tension["mate_in"]
    
    # Perform interpolation
    result = template
    for key, value in context.items():
        result = result.replace(f"{{{key}}}", str(value))
    
    return result


def _piece_name(symbol: str) -> str:
    """Convert piece symbol to readable name."""
    names = {
        "K": "king",
        "Q": "queen", 
        "R": "rook",
        "B": "bishop",
        "N": "knight",
        "P": "pawn",
    }
    return names.get(symbol.upper(), "piece")


def serialize_commentary(
    rule: Dict[str, Any],
    affordances: List[Dict[str, Any]],
    heuristics: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Serialize rule and affordances to output schema.
    
    Output schema:
        {
            "label": "excellent",
            "text": "This move creates a skewer.",
            "confidence": 0.91,
            "idea": "SKEWER",
            "affordances": [...]
        }
    """
    commentary = rule.get("commentary", {})
    templates = commentary.get("templates", [])
    facts = rule.get("matched_facts", {})
    fen = facts.get("fen")
    rule_id = rule.get("id")
    
    # Select and interpolate template
    template = _select_template_deterministic(templates, fen, rule_id)
    text = _interpolate_template(template, heuristics, facts)
    
    return {
        "label": commentary.get("label", "good"),
        "text": text,
        "confidence": rule.get("confidence", 0.5),
        "idea": rule.get("id", "UNKNOWN"),
        "category": rule.get("category", "filler"),
        "priority": rule.get("priority", 0),
        "affordances": affordances,
    }
