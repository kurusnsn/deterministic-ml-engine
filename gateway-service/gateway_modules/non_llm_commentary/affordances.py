"""
UI Affordances Generator for Non-LLM Commentary.

Generates structured affordance payloads for frontend visualization.
"""

from typing import Dict, Any, List, Optional


# Affordance types
AFFORDANCE_TYPES = {
    "HIGHLIGHT": "highlight",       # Highlight squares
    "ARROW": "arrow",               # Arrow from/to
    "LINE": "line",                 # Line through squares (skewer/pin)
    "SHADED_FILE": "shaded_file",   # Shade entire file
    "SHADED_RANK": "shaded_rank",   # Shade entire rank
    "PAWN_PATH": "pawn_path",       # Path from pawn to promotion
    "SHOW_TACTIC": "show_tactic",   # Button: show tactic line
    "SHOW_FOLLOW_UP": "show_follow_up",  # Button: show engine best line
    "SHOW_CHECKMATE": "show_checkmate",  # Button: show mate line
}


def _resolve_template_value(
    template: str,
    heuristics: Dict[str, Any],
    facts: Dict[str, Any] = None,
) -> Any:
    """
    Resolve a template value like 'fork_square' or 'pin_line'.
    
    Maps template keys to actual values from heuristics.
    """
    facts = facts or {}
    
    # Direct mappings
    mappings = {
        # Fork-related
        "fork_square": lambda: _get_fork_square(heuristics),
        "fork_targets": lambda: _get_fork_targets(heuristics),
        
        # Pin-related
        "pin_line": lambda: _get_pin_line(heuristics),
        "pinned_piece_square": lambda: _get_pinned_square(heuristics),
        
        # Skewer-related
        "skewer_squares": lambda: _get_skewer_line(heuristics),
        
        # King-related
        "king_square": lambda: _get_king_square(heuristics, facts),
        "king_zone": lambda: _get_king_zone(heuristics),
        "back_rank": lambda: _get_back_rank(heuristics, facts),
        
        # File/rank
        "open_file": lambda: _get_open_file(heuristics),
        
        # Pawn-related
        "passed_pawn_square": lambda: _get_passed_pawn_square(heuristics),
        "promotion_square": lambda: _get_promotion_square(heuristics),
        "pawn_square": lambda: _get_passed_pawn_square(heuristics),
        "isolated_pawn_square": lambda: _get_isolated_pawn_square(heuristics),
        "doubled_pawn_squares": lambda: _get_doubled_pawn_squares(heuristics),
        "pawn_chain_squares": lambda: _get_pawn_chain_squares(heuristics),
        
        # Outpost
        "outpost_square": lambda: _get_outpost_square(heuristics),
        
        # Discovered attack
        "discovered_attacker": lambda: _get_discovered_attacker(heuristics),
        "discovered_target": lambda: _get_discovered_target(heuristics),
        "checking_piece": lambda: _get_checking_piece(heuristics),
        "checking_pieces": lambda: _get_checking_pieces(heuristics),
        
        # Diagonal
        "diagonal_squares": lambda: _get_fianchetto_diagonal(heuristics),
        
        # Weak squares
        "weak_squares": lambda: _get_weak_squares(heuristics),
        
        # Engine line
        "engine_pv": lambda: _get_engine_pv(heuristics),
    }
    
    if template in mappings:
        return mappings[template]()
    
    # Check if it's a literal value (list of squares)
    if isinstance(template, list):
        return template
    
    return None


def _get_fork_square(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the square of the forking piece."""
    fork_data = heuristics.get("fork_data", {})
    return fork_data.get("forking_square")


def _get_fork_targets(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get the squares being forked."""
    fork_data = heuristics.get("fork_data", {})
    return fork_data.get("forked_squares", [])


def _get_pin_line(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares forming the pin line."""
    pin_data = heuristics.get("pin_data", {})
    if pin_data:
        return [
            pin_data.get("pinner_square"),
            pin_data.get("pinned_square"),
            pin_data.get("pinned_to_square"),
        ]
    return None


def _get_pinned_square(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the square of the pinned piece."""
    pin_data = heuristics.get("pin_data", {})
    return pin_data.get("pinned_square")


def _get_skewer_line(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares forming the skewer line."""
    skewer_data = heuristics.get("skewer_data", {})
    if skewer_data:
        return [
            skewer_data.get("attacker_square"),
            skewer_data.get("front_piece_square"),
            skewer_data.get("back_piece_square"),
        ]
    return None


def _get_king_square(heuristics: Dict[str, Any], facts: Dict[str, Any]) -> Optional[str]:
    """Get the king square (for the side that's in check/trouble)."""
    king_safety = heuristics.get("king_safety", {})
    return king_safety.get("king_square")


def _get_king_zone(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares in the king zone."""
    king_safety = heuristics.get("king_safety", {})
    return king_safety.get("king_zone_squares", [])


def _get_back_rank(heuristics: Dict[str, Any], facts: Dict[str, Any]) -> int:
    """Get the back rank (1 for white, 8 for black)."""
    # Determine which side has the weak back rank
    turn = facts.get("turn", "white")
    return 1 if turn == "white" else 8


def _get_open_file(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the open file letter."""
    position_facts = heuristics.get("position_facts", {})
    open_files = position_facts.get("open_files", [])
    return open_files[0] if open_files else None


def _get_passed_pawn_square(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the square of a passed pawn."""
    pawn_structure = heuristics.get("pawn_structure", {})
    passed_pawns = pawn_structure.get("passed_pawns", [])
    return passed_pawns[0] if passed_pawns else None


def _get_promotion_square(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the promotion square for a passed pawn."""
    pawn_square = _get_passed_pawn_square(heuristics)
    if not pawn_square:
        return None
    
    file = pawn_square[0]
    # Determine promotion rank based on pawn position
    rank = int(pawn_square[1])
    if rank > 4:
        return f"{file}8"  # White pawn promotes on 8
    else:
        return f"{file}1"  # Black pawn promotes on 1


def _get_isolated_pawn_square(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the square of an isolated pawn."""
    pawn_structure = heuristics.get("pawn_structure", {})
    isolated = pawn_structure.get("isolated_pawns", [])
    return isolated[0] if isolated else None


def _get_doubled_pawn_squares(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares of doubled pawns."""
    pawn_structure = heuristics.get("pawn_structure", {})
    return pawn_structure.get("doubled_pawns", [])


def _get_pawn_chain_squares(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares forming a pawn chain."""
    pawn_structure = heuristics.get("pawn_structure", {})
    return pawn_structure.get("pawn_chains", [[]])[0]


def _get_outpost_square(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the outpost square."""
    position_facts = heuristics.get("position_facts", {})
    outposts = position_facts.get("outposts", [])
    return outposts[0] if outposts else None


def _get_discovered_attacker(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the square of the piece making the discovered attack."""
    discovered = heuristics.get("discovered_attack_data", {})
    return discovered.get("attacker_square")


def _get_discovered_target(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the target of the discovered attack."""
    discovered = heuristics.get("discovered_attack_data", {})
    return discovered.get("target_square")


def _get_checking_piece(heuristics: Dict[str, Any]) -> Optional[str]:
    """Get the square of the checking piece."""
    check_data = heuristics.get("check_data", {})
    checkers = check_data.get("checking_squares", [])
    return checkers[0] if checkers else None


def _get_checking_pieces(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares of all checking pieces."""
    check_data = heuristics.get("check_data", {})
    return check_data.get("checking_squares", [])


def _get_fianchetto_diagonal(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get squares of the fianchetto diagonal."""
    position_facts = heuristics.get("position_facts", {})
    return position_facts.get("fianchetto_diagonal", [])


def _get_weak_squares(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get weak squares."""
    position_facts = heuristics.get("position_facts", {})
    return position_facts.get("weak_squares", [])


def _get_engine_pv(heuristics: Dict[str, Any]) -> Optional[List[str]]:
    """Get the engine principal variation."""
    engine = heuristics.get("engine", {})
    return engine.get("pv", [])


def _build_affordance(
    affordance_spec: Dict[str, Any],
    heuristics: Dict[str, Any],
    facts: Dict[str, Any] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build a single affordance from its specification.
    
    Args:
        affordance_spec: Dict from rule's affordances list
        heuristics: Computed heuristics
        facts: Matched facts from rule evaluation
    
    Returns:
        Affordance dict ready for frontend, or None if cannot build
    """
    affordance_type = affordance_spec.get("type")
    if not affordance_type:
        return None
    
    facts = facts or {}
    
    result = {"type": affordance_type}
    
    # Handle different affordance types
    if affordance_type == "ARROW":
        from_spec = affordance_spec.get("from")
        to_spec = affordance_spec.get("to")
        
        from_val = _resolve_template_value(from_spec, heuristics, facts)
        to_val = _resolve_template_value(to_spec, heuristics, facts)
        
        if from_val and to_val:
            result["from"] = from_val
            result["to"] = to_val if isinstance(to_val, list) else [to_val]
            result["color"] = affordance_spec.get("color", "red")
            result["multiple"] = affordance_spec.get("multiple", False)
        else:
            return None
    
    elif affordance_type == "LINE":
        through_spec = affordance_spec.get("through")
        through_val = _resolve_template_value(through_spec, heuristics, facts)
        
        if through_val:
            result["squares"] = through_val
            result["color"] = affordance_spec.get("color", "red")
        else:
            return None
    
    elif affordance_type == "HIGHLIGHT":
        squares_spec = affordance_spec.get("squares")
        target_spec = affordance_spec.get("target")
        
        if squares_spec:
            squares_val = _resolve_template_value(squares_spec, heuristics, facts)
            if squares_val:
                result["squares"] = squares_val if isinstance(squares_val, list) else [squares_val]
        elif target_spec:
            target_val = _resolve_template_value(target_spec, heuristics, facts)
            if target_val:
                result["squares"] = [target_val] if isinstance(target_val, str) else target_val
        else:
            return None
        
        result["color"] = affordance_spec.get("color", "yellow")
    
    elif affordance_type == "SHADED_FILE":
        file_spec = affordance_spec.get("file")
        file_val = _resolve_template_value(file_spec, heuristics, facts)
        
        if file_val:
            result["file"] = file_val
            result["color"] = affordance_spec.get("color", "green")
        else:
            return None
    
    elif affordance_type == "SHADED_RANK":
        rank_spec = affordance_spec.get("rank")
        if isinstance(rank_spec, int):
            result["rank"] = rank_spec
        else:
            rank_val = _resolve_template_value(rank_spec, heuristics, facts)
            if rank_val:
                result["rank"] = rank_val
            else:
                return None
        
        result["color"] = affordance_spec.get("color", "green")
    
    elif affordance_type == "PAWN_PATH":
        from_spec = affordance_spec.get("from")
        to_spec = affordance_spec.get("to")
        
        from_val = _resolve_template_value(from_spec, heuristics, facts)
        to_val = _resolve_template_value(to_spec, heuristics, facts)
        
        if from_val and to_val:
            result["from"] = from_val
            result["to"] = to_val
            result["color"] = affordance_spec.get("color", "green")
        else:
            return None
    
    elif affordance_type in ("SHOW_TACTIC", "SHOW_FOLLOW_UP", "SHOW_CHECKMATE"):
        line_source = affordance_spec.get("line_source")
        line = _resolve_template_value(line_source, heuristics, facts)
        
        if line:
            result["line"] = line
        else:
            # Button without line is okay - frontend can fetch
            pass
    
    return result


def generate_affordances(
    rule: Dict[str, Any],
    heuristics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Generate UI affordances for a matched rule.
    
    Args:
        rule: The matched rule dict
        heuristics: Computed heuristics
    
    Returns:
        List of affordance dicts for frontend
    """
    affordance_specs = rule.get("affordances", [])
    facts = rule.get("matched_facts", {})
    
    affordances = []
    
    for spec in affordance_specs:
        affordance = _build_affordance(spec, heuristics, facts)
        if affordance:
            affordances.append(affordance)
    
    return affordances


# =============================================================================
# RICH COMMENTARY: Motif-based Action Generation
# =============================================================================

from dataclasses import dataclass, field, asdict
from typing import Tuple


@dataclass
class CommentaryAction:
    """
    UI action attached to commentary.
    
    Rendered as a button/link that shows additional visualization.
    """
    label: str  # e.g., "Show Fork", "Show Follow-Up"
    pv: List[str] = field(default_factory=list)  # Principal variation to show
    overlay: Dict[str, Any] = field(default_factory=dict)  # arrows, highlights
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def generate_commentary_actions(
    motifs: "DetectedMotifs",  # Forward reference
    engine_pv: Optional[List[str]] = None,
) -> List[CommentaryAction]:
    """
    Generate UI actions based on detected motifs.
    
    This is the main entry point for the rich commentary action system.
    
    Args:
        motifs: DetectedMotifs instance from motif_detection
        engine_pv: Principal variation from engine analysis
        
    Returns:
        List of CommentaryAction instances
    """
    from ..analysis.motif_detection import DetectedMotifs, ENABLE_RICH_STOCKFISH_COMMENTARY
    
    if not ENABLE_RICH_STOCKFISH_COMMENTARY:
        return []
    
    if motifs is None:
        return []
    
    engine_pv = engine_pv or []
    actions = []
    
    # Fork action
    if motifs.fork and motifs.fork_square and motifs.fork_targets:
        arrows = [(motifs.fork_square, target) for target in motifs.fork_targets]
        actions.append(CommentaryAction(
            label="Show Fork",
            pv=[],
            overlay={
                "arrows": arrows,
                "highlight_squares": [motifs.fork_square],
            }
        ))
    
    # Pin action
    if motifs.pin and motifs.pin_line:
        actions.append(CommentaryAction(
            label="Show Pin",
            pv=[],
            overlay={
                "line": motifs.pin_line,
                "highlight_squares": motifs.pin_line,
            }
        ))
    
    # Skewer action
    if motifs.skewer and motifs.skewer_squares:
        actions.append(CommentaryAction(
            label="Show Skewer",
            pv=[],
            overlay={
                "line": motifs.skewer_squares,
            }
        ))
    
    # Back-rank action
    if motifs.back_rank_weakness and motifs.back_rank:
        rank_squares = [f"{f}{motifs.back_rank}" for f in "abcdefgh"]
        actions.append(CommentaryAction(
            label="Show Back Rank",
            pv=[],
            overlay={
                "highlight_squares": rank_squares,
            }
        ))
    
    # Passed pawn action
    if motifs.passed_pawn and motifs.passed_pawn_square:
        pawn_sq = motifs.passed_pawn_square
        file = pawn_sq[0]
        rank = int(pawn_sq[1])
        promo_rank = 8 if rank > 4 else 1
        promo_sq = f"{file}{promo_rank}"
        
        actions.append(CommentaryAction(
            label="Show Passed Pawn",
            pv=[],
            overlay={
                "pawn_path": {"from": pawn_sq, "to": promo_sq},
                "highlight_squares": [pawn_sq],
            }
        ))
    
    # Promotion threat action
    if motifs.promotion_threat and motifs.promoting_pawn_square:
        actions.append(CommentaryAction(
            label="Show Promotion",
            pv=[],
            overlay={
                "pawn_path": {
                    "from": motifs.promoting_pawn_square,
                    "to": motifs.promotion_square,
                },
                "highlight_squares": [motifs.promoting_pawn_square],
            }
        ))
    
    # Only move / forced line action
    if motifs.only_move and motifs.forced_line:
        actions.append(CommentaryAction(
            label="Show Follow-Up",
            pv=motifs.forced_line,
            overlay={}
        ))
    
    # If engine PV available and no specific tactic, offer to show best line
    if engine_pv and not any([
        motifs.fork, motifs.pin, motifs.skewer, 
        motifs.back_rank_weakness, motifs.only_move
    ]):
        if len(engine_pv) >= 2:
            actions.append(CommentaryAction(
                label="Show Best Line",
                pv=engine_pv[:5],
                overlay={}
            ))
    
    return actions
