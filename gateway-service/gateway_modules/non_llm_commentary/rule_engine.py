"""
Rule Engine for Non-LLM Commentary.

Parses rules.yaml and evaluates rule preconditions against computed facts.
No logic execution—pure condition matching.
"""

import os
from pathlib import Path
from typing import Dict, Any, List, Optional
import yaml


# Cache for loaded rules
_RULES_CACHE: List[Dict[str, Any]] | None = None


def _load_rules() -> List[Dict[str, Any]]:
    """Load and cache rules from rules.yaml."""
    global _RULES_CACHE
    
    if _RULES_CACHE is not None:
        return _RULES_CACHE
    
    rules_path = Path(__file__).parent / "rules.yaml"
    
    with open(rules_path, "r") as f:
        data = yaml.safe_load(f)
    
    _RULES_CACHE = data.get("rules", [])
    return _RULES_CACHE


def _get_nested_value(obj: Dict[str, Any], path: str) -> Any:
    """
    Get nested value from dict using dot notation.
    
    Examples:
        _get_nested_value({"a": {"b": 1}}, "a.b") -> 1
        _get_nested_value({"tension": {"has_winning_capture": True}}, "tension.has_winning_capture") -> True
    """
    keys = path.split(".")
    value = obj
    
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
        
        if value is None:
            return None
    
    return value


def _evaluate_condition(condition: Dict[str, Any], facts: Dict[str, Any]) -> bool:
    """
    Evaluate a single condition against facts.
    
    Supported condition types:
        - equals: value must equal specified value
        - not_equals: value must not equal specified value
        - exists: value must exist (not None)
        - min_value: value must be >= specified value
        - max_value: value must be <= specified value
    """
    fact_path = condition.get("fact")
    if not fact_path:
        return False
    
    value = _get_nested_value(facts, fact_path)
    
    # Check existence condition
    if "exists" in condition:
        if condition["exists"] and value is None:
            return False
        if not condition["exists"] and value is not None:
            return False
    
    # Check equals condition
    if "equals" in condition:
        if value != condition["equals"]:
            return False
    
    # Check not_equals condition
    if "not_equals" in condition:
        if value == condition["not_equals"]:
            return False
    
    # Check min_value condition
    if "min_value" in condition:
        if value is None or not isinstance(value, (int, float)):
            return False
        if value < condition["min_value"]:
            return False
    
    # Check max_value condition
    if "max_value" in condition:
        if value is None or not isinstance(value, (int, float)):
            return False
        if value > condition["max_value"]:
            return False
    
    return True


def _evaluate_rule(rule: Dict[str, Any], facts: Dict[str, Any]) -> bool:
    """
    Evaluate all conditions of a rule.
    All conditions must match for the rule to fire.
    """
    conditions = rule.get("conditions", [])
    
    if not conditions:
        return False
    
    for condition in conditions:
        if not _evaluate_condition(condition, facts):
            return False
    
    return True


def _extract_facts_from_heuristics(
    heuristics: Dict[str, Any],
    position_facts: Dict[str, Any] = None,
    move_san: str = None,
    fen: str = None,
    prev_fen: str = None,
    move_uci: str = None,
    engine_data: Dict[str, Any] = None,
    move_classification: str = None,
    is_book_move: bool = False,
) -> Dict[str, Any]:
    """
    Extract a unified facts dict from heuristics and position_facts.
    
    This normalizes the data structure for rule evaluation.
    Now also integrates Chess.com-style fact extraction.
    """
    facts = {}
    
    # Copy heuristics directly
    if heuristics:
        facts.update(heuristics)
    
    # Merge position_facts
    if position_facts:
        facts.update(position_facts)
    
    # Add move info
    if move_san:
        facts["move_san"] = move_san
    
    if fen:
        facts["fen"] = fen
    
    # Extract common facts from heuristics structure
    
    # Check for checkmate
    if heuristics.get("is_checkmate"):
        facts["is_checkmate"] = True
    
    # Check for mate in N
    tension = heuristics.get("tension", {})
    if tension.get("mate_in"):
        facts["mate_in"] = tension["mate_in"]
    
    # Check for winning capture
    if tension.get("has_winning_capture"):
        facts["tension.has_winning_capture"] = True
    
    # Extract tactical flags
    facts["fork"] = heuristics.get("fork", False)
    facts["pin"] = heuristics.get("pin", False)
    facts["skewer"] = heuristics.get("skewer", False)
    facts["discovered_attack"] = heuristics.get("discovered_attack", False)
    
    # Extract pawn structure
    pawn_structure = heuristics.get("pawn_structure", {})
    if pawn_structure.get("passed_pawns"):
        facts["passed_pawn_created"] = True
    if pawn_structure.get("isolated_pawns"):
        facts["isolated_pawn"] = True
    if pawn_structure.get("doubled_pawns"):
        facts["doubled_pawns_created"] = True
    
    # Extract position facts
    if position_facts:
        facts["game_phase"] = position_facts.get("game_phase", "middlegame")
        
        castling = position_facts.get("castling", {})
        if castling.get("white_just_castled") or castling.get("black_just_castled"):
            facts["just_castled"] = True
            # Determine castle side
            if castling.get("white_castled_kingside") or castling.get("black_castled_kingside"):
                facts["castle_side"] = "kingside"
            else:
                facts["castle_side"] = "queenside"
    
    # =========================================================================
    # CHESS.COM-STYLE FACTS (enhanced pattern detection)
    # =========================================================================
    try:
        from .chesscom_facts import extract_chesscom_facts
        
        chesscom_facts = extract_chesscom_facts(
            fen=fen or facts.get("fen", ""),
            move_san=move_san,
            move_uci=move_uci,
            heuristics=heuristics,
            engine_data=engine_data,
            prev_fen=prev_fen,
            is_book_move=is_book_move,
            move_classification=move_classification,
        )
        
        # Merge Chess.com facts (don't override existing facts)
        for key, value in chesscom_facts.items():
            if key not in facts or facts[key] is None:
                facts[key] = value
                
    except ImportError:
        # chesscom_facts module not available - skip silently
        pass
    except Exception as e:
        # Don't break rule evaluation if fact extraction fails
        facts["_chesscom_facts_error"] = str(e)
    
    return facts


def evaluate_rules(
    heuristics: Dict[str, Any],
    position_facts: Dict[str, Any] = None,
    move_san: str = None,
    fen: str = None,
    prev_fen: str = None,
    move_uci: str = None,
    engine_data: Dict[str, Any] = None,
    move_classification: str = None,
    is_book_move: bool = False,
) -> List[Dict[str, Any]]:
    """
    Evaluate all rules against the given facts.
    
    Args:
        heuristics: Dict from heuristics_service
        position_facts: Optional position facts
        move_san: Optional move SAN
        fen: Optional FEN (after move)
        prev_fen: Optional previous FEN (before move)
        move_uci: Optional move in UCI format
        engine_data: Optional engine analysis data
        move_classification: Optional move quality (best, good, mistake, etc.)
        is_book_move: Whether this is a book/theory move
    
    Returns:
        List of matching rules with evaluated data
    """
    rules = _load_rules()
    facts = _extract_facts_from_heuristics(
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
    
    matching_rules = []
    
    for rule in rules:
        if _evaluate_rule(rule, facts):
            # Create enriched rule with extracted data
            enriched_rule = {
                **rule,
                "matched_facts": facts,
            }
            matching_rules.append(enriched_rule)
    
    return matching_rules


def clear_cache():
    """Clear the rules cache (for testing)."""
    global _RULES_CACHE
    _RULES_CACHE = None
