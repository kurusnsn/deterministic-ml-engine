"""
Rule Arbitration for Non-LLM Commentary.

Selects the best rule from matching candidates using priority-based selection.
Enforces:
- At most ONE commentary item per move
- Silence when no rule clears confidence threshold
- Repetition cooldown
"""

from typing import Dict, Any, List, Optional
from collections import deque

from .config import (
    PRIORITY_TIERS,
    CONFIDENCE_THRESHOLD,
    REPETITION_COOLDOWN_MOVES,
    VERBOSITY_LEVEL,
)


# Global state for repetition tracking
# Stores tuples of (rule_id, move_number)
_recent_rules: deque = deque(maxlen=20)
_current_move_number: int = 0


def _get_priority_tier_value(category: str) -> int:
    """Get the priority tier value for a category."""
    return PRIORITY_TIERS.get(category, 0)


def _compute_effective_priority(rule: Dict[str, Any]) -> float:
    """
    Compute effective priority for a rule.
    
    Combines:
    - Category tier priority (forced_outcome > tactical > positional > pawn > filler)
    - Within-category priority
    - Confidence
    """
    category = rule.get("category", "filler")
    tier_priority = _get_priority_tier_value(category)
    
    within_priority = rule.get("priority", 0)
    confidence = rule.get("confidence", 0.5)
    
    # Effective priority: tier * 1000 + within_priority * 10 + confidence
    return tier_priority * 1000 + within_priority * 10 + confidence


def _check_verbosity_filter(rule: Dict[str, Any], verbosity: int) -> bool:
    """Check if rule passes verbosity filter."""
    min_verbosity = rule.get("min_verbosity", 0)
    return verbosity >= min_verbosity


def _check_confidence_threshold(rule: Dict[str, Any]) -> bool:
    """Check if rule confidence meets threshold."""
    confidence = rule.get("confidence", 0.0)
    return confidence >= CONFIDENCE_THRESHOLD


def _check_repetition_cooldown(rule: Dict[str, Any], move_number: int) -> bool:
    """
    Check if rule is allowed based on repetition cooldown.
    
    Returns True if the rule can be used (not recently used).
    """
    rule_id = rule.get("id")
    if not rule_id:
        return True
    
    for past_rule_id, past_move in _recent_rules:
        if past_rule_id == rule_id:
            if move_number - past_move < REPETITION_COOLDOWN_MOVES:
                return False
    
    return True


def _record_rule_usage(rule: Dict[str, Any], move_number: int):
    """Record that a rule was used at a given move number."""
    rule_id = rule.get("id")
    if rule_id:
        _recent_rules.append((rule_id, move_number))


def arbitrate_rules(
    matching_rules: List[Dict[str, Any]],
    verbosity: int = None,
    move_number: int = None,
) -> Optional[Dict[str, Any]]:
    """
    Select the best rule from matching candidates.
    
    Priority order:
    1. Forced outcomes (mate, forced win)
    2. Tactical motifs (fork, skewer, pin)
    3. Positional ideas
    4. Pawn structure
    5. Filler
    
    Within each tier, rules are sorted by:
    - Within-category priority
    - Confidence
    
    Args:
        matching_rules: List of rules that matched conditions
        verbosity: Override verbosity level (0-4)
        move_number: Current move number for cooldown tracking
    
    Returns:
        Selected rule dict, or None if no rule should fire
    """
    global _current_move_number
    
    if not matching_rules:
        return None
    
    verbosity = verbosity if verbosity is not None else VERBOSITY_LEVEL
    move_number = move_number if move_number is not None else _current_move_number
    
    # Filter by verbosity
    filtered_rules = [
        r for r in matching_rules
        if _check_verbosity_filter(r, verbosity)
    ]
    
    if not filtered_rules:
        return None
    
    # Filter by confidence threshold
    filtered_rules = [
        r for r in filtered_rules
        if _check_confidence_threshold(r)
    ]
    
    if not filtered_rules:
        return None
    
    # Filter by repetition cooldown
    filtered_rules = [
        r for r in filtered_rules
        if _check_repetition_cooldown(r, move_number)
    ]
    
    if not filtered_rules:
        return None
    
    # Sort by effective priority (descending)
    sorted_rules = sorted(
        filtered_rules,
        key=_compute_effective_priority,
        reverse=True,
    )
    
    # Select top rule
    selected = sorted_rules[0]
    
    # Record usage for cooldown
    _record_rule_usage(selected, move_number)
    
    # Increment move counter
    _current_move_number = move_number + 1
    
    return selected


def reset_arbitration_state():
    """Reset arbitration state (for testing)."""
    global _recent_rules, _current_move_number
    _recent_rules.clear()
    _current_move_number = 0


def set_move_number(move_number: int):
    """Set current move number (for testing)."""
    global _current_move_number
    _current_move_number = move_number
