"""
Position Evaluation Service - Heuristic-based positional scoring.

Evaluates a SINGLE resulting board position using tactical and positional
heuristics. No alternative moves, no search, no pre-move evaluation.

This module is separate from puzzle heuristics and should not be modified
to affect puzzle generation logic.
"""

import chess
import hashlib
from typing import Dict, Any, Tuple, Optional, List


# =============================================================================
# SCORING WEIGHTS (documented formulas)
# =============================================================================

# Tactical scoring weights
# High-impact patterns get high weights, low-impact or often-false-positive patterns
# get reduced weights to avoid inflated scores in normal positions
TACTICAL_WEIGHTS = {
    "hanging_piece": 15,      # ±15: Undefended piece under attack (significant!)
    "trapped_piece": 20,      # ±20: Piece with no safe squares (very significant)
    "fork": 15,               # ±15: Attack on two+ pieces (significant)
    "pin": 8,                 # ±8: Piece pinned to king/valuable piece
    "skewer": 12,             # ±12: Attack through piece to more valuable one
    "xray": 0,                # ±0: Disabled - too many false positives
    "overloaded_piece": 0,    # ±0: Disabled - fires in almost every position
    "discovered_attack": 0,   # ±0: Disabled - fires incorrectly often
    "king_safety_drop": 10,   # ±10: King exposed (weak pawn shield)
}

# NEW: Tension-related tactical weights
# These are used when the new tension analysis is available
TACTICAL_WEIGHTS_TENSION = {
    "trade_available": 1,       # ±1: Minor; tension exists but no material gain
    "threatened_piece": 1,      # ±1: Minor; attacked and defended
    "winning_capture": 12,      # ±12: Significant; can win material via SEE
    "losing_capture": 0,        # ±0: No bonus; this would benefit opponent
    "true_hanging": 15,         # ±15: Truly undefended piece (replaces old hanging_piece)
}

# Pawn structure weights
PAWN_WEIGHTS = {
    "passed_pawn": 15,        # ±15 each: Pawn with no blockers (endgame strength)
    "doubled_pawn": -3,       # -3 each: Two pawns on same file
    "isolated_pawn": -4,      # -4 each: Pawn with no neighbors
}

# Positional weights (DISABLED - too many false positives in opening)
# The weak_square and outpost detection fires in almost every position
POSITIONAL_WEIGHTS = {
    "weak_square": 0,         # ±0: Disabled - fires constantly
    "outpost": 0,             # ±0: Disabled - too many detected
}

# Mobility weight (reduced to avoid inflated opening scores)
MOBILITY_WEIGHT = 0.3         # (own_mobility) * 0.3 - was too high at 1.0

# Space advantage weight
SPACE_ADVANTAGE_WEIGHT = 3    # ±3 for space control - was too high at 6


# =============================================================================
# EVALUATION TIERS (thresholds in centipawn-equivalent units)
# =============================================================================
# These thresholds determine when an advantage goes from "slight" to "comfortable"
# to "winning". Values are based on typical positional scoring sums.
# After 1.e4, a position might score ~25-30 just from mobility + space, so
# thresholds must be higher to avoid exaggerated assessments.

TIER_THRESHOLDS = [
    (15, "equal"),              # ±15 = equal (opening positions, no tactics)
    (35, "slightly_better"),    # 16–35 = slight edge (minor advantage)
    (60, "better"),             # 36–60 = comfortable advantage
    (100, "much_better"),       # 61–100 = significant advantage  
    (float("inf"), "winning"),  # 100+ = winning
]

# =============================================================================
# TIER TO UI MAPPING (chess.com-style headlines)
# =============================================================================

TIER_TO_UI = {
    "equal": {
        "headline": "Game is equal",
        "icon": "balance",
        "tone": "neutral",
    },
    "white_slightly_better": {
        "headline": "White is slightly better",
        "icon": "up_arrow",
        "tone": "good_for_white",
    },
    "white_better": {
        "headline": "White is better",
        "icon": "up_arrow",
        "tone": "good_for_white",
    },
    "white_much_better": {
        "headline": "White has a big advantage",
        "icon": "double_up",
        "tone": "good_for_white",
    },
    "white_winning": {
        "headline": "White is winning",
        "icon": "checkmate",
        "tone": "decisive_white",
    },
    "black_slightly_better": {
        "headline": "Black is slightly better",
        "icon": "down_arrow",
        "tone": "good_for_black",
    },
    "black_better": {
        "headline": "Black is better",
        "icon": "down_arrow",
        "tone": "good_for_black",
    },
    "black_much_better": {
        "headline": "Black has a big advantage",
        "icon": "double_down",
        "tone": "good_for_black",
    },
    "black_winning": {
        "headline": "Black is winning",
        "icon": "checkmate",
        "tone": "decisive_black",
    },
}

# =============================================================================
# COMMENTARY TEMPLATES (pattern-specific)
# =============================================================================

# Generic tier-based templates (fallback when no specific patterns detected)
TIER_COMMENTARY_TEMPLATES = {
    "equal": [
        "The position is balanced.",
        "The game is roughly equal.",
        "Neither side has a clear advantage.",
        "A solid, balanced position.",
    ],
    "white_slightly_better": [
        "White has a small edge.",
        "White is slightly better.",
        "White has a minor advantage.",
    ],
    "white_better": [
        "White has a clear advantage.",
        "White is better here.",
        "White has a comfortable edge.",
    ],
    "white_much_better": [
        "White is much better.",
        "White has a significant advantage.",
        "White dominates the position.",
    ],
    "white_winning": [
        "White is winning.",
        "White has a decisive advantage.",
        "White should convert this position.",
    ],
    "black_slightly_better": [
        "Black has a small edge.",
        "Black is slightly better.",
        "Black has a minor advantage.",
    ],
    "black_better": [
        "Black has a clear advantage.",
        "Black is better here.",
        "Black has a comfortable edge.",
    ],
    "black_much_better": [
        "Black is much better.",
        "Black has a significant advantage.",
        "Black dominates the position.",
    ],
    "black_winning": [
        "Black is winning.",
        "Black has a decisive advantage.",
        "Black should convert this position.",
    ],
}

# Pattern-specific commentary templates
PATTERN_COMMENTARY = {
    "fork": [
        "There's a fork in the position!",
        "A piece is attacking multiple targets.",
        "A tactical fork creates threats.",
    ],
    "pin": [
        "A piece is pinned.",
        "There's an important pin on the board.",
        "A pin restricts movement.",
    ],
    "skewer": [
        "A skewer is present on the board.",
        "A tactical skewer attacks through a piece.",
    ],
    "hanging_piece": [
        "There's a hanging piece!",
        "An undefended piece is under attack.",
        "A piece is vulnerable.",
    ],
    "trapped_piece": [
        "A piece is trapped!",
        "A piece has no safe squares.",
        "A trapped piece creates problems.",
    ],
    "overloaded_piece": [
        "A piece is overloaded.",
        "A defender has too many duties.",
    ],
    "discovered_attack": [
        "A discovered attack is possible.",
        "Opening a line reveals an attack.",
    ],
    "king_safety_drop": [
        "The king is exposed.",
        "King safety is a concern.",
        "The pawn shield is weakened.",
    ],
    "passed_pawn": [
        "A passed pawn advances.",
        "The passed pawn is dangerous.",
        "A pawn is marching forward.",
    ],
    "isolated_pawn": [
        "An isolated pawn is vulnerable.",
        "The isolated pawn weakens the structure.",
    ],
    "doubled_pawn": [
        "Doubled pawns create a weakness.",
        "The pawn structure is compromised.",
    ],
    # NEW: Tension/trade patterns (replaces false "hanging" classification)
    "tension_trade": [
        "There's tension in the position; an exchange is possible.",
        "A piece is attacked and defended — trades may follow.",
        "This increases pressure, inviting exchanges.",
        "The position features tactical tension.",
    ],
    "winning_capture": [
        "A winning capture is available!",
        "One side can win material with a tactical capture.",
        "There's material to gain here.",
        "A favorable capture exists.",
    ],
    "equal_trade": [
        "An equal exchange is possible.",
        "Pieces can be traded off evenly.",
        "A fair trade is available.",
    ],
}

# Opening move commentary (for early game positions)
OPENING_COMMENTARY = {
    "equal": [
        "A standard opening position.",
        "The game is just getting started.",
        "Both sides are developing.",
        "A typical opening setup.",
    ],
}

# Phase-specific commentary templates
PHASE_COMMENTARY = {
    "opening": {
        "development": [
            "Focus on piece development and king safety.",
            "Developing pieces to active squares.",
            "Following sound opening principles.",
        ],
        "castling_prep": [
            "Preparing to castle and connect the rooks.",
            "This helps prepare castling and improves king safety.",
        ],
    },
    "middlegame": {
        "general": [
            "The middlegame battle is underway.",
            "Both sides are maneuvering for advantage.",
            "Plans and piece activity are key here.",
        ],
        "attack": [
            "Building pressure on the opponent's position.",
            "An attack is brewing.",
        ],
        "defense": [
            "Defensive resources are needed.",
            "Holding the position requires care.",
        ],
    },
    "endgame": {
        "general": [
            "The endgame has begun.",
            "King activity becomes crucial.",
            "Pawn advancement is the key.",
        ],
        "passed_pawn": [
            "The passed pawn could decide the game.",
            "Racing to promote.",
        ],
    },
}

# Castling-related commentary
CASTLING_COMMENTARY = {
    "just_castled": [
        "The king finds safety.",
        "Castling connects the rooks.",
        "King safety is secured.",
    ],
    "can_castle": [
        "Castling remains an option.",
    ],
    "lost_castling": [
        "Castling rights have been lost.",
        "The king may need to find safety another way.",
    ],
}

# Summary templates (one-line verdicts)
SUMMARY_TEMPLATES = {
    "equal": "The position is equal.",
    "white_slightly_better": "White is slightly better.",
    "white_better": "White has a clear advantage.",
    "white_much_better": "White is much better.",
    "white_winning": "White is winning.",
    "black_slightly_better": "Black is slightly better.",
    "black_better": "Black has a clear advantage.",
    "black_much_better": "Black is much better.",
    "black_winning": "Black is winning.",
    "unclear": "The position is unclear.",
}


# =============================================================================
# HELPER: SPACE ADVANTAGE CALCULATION
# =============================================================================

def _calculate_space_advantage(board: chess.Board) -> Tuple[int, int]:
    """
    Calculate space advantage based on piece distribution.
    
    White space = pieces/pawns on ranks 4-6 (indices 3-5)
    Black space = pieces/pawns on ranks 3-1 (indices 2-0)
    
    Returns:
        (white_space_count, black_space_count)
    """
    white_space = 0
    black_space = 0
    
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue
        
        rank = chess.square_rank(square)
        
        if piece.color == chess.WHITE:
            # White pieces on ranks 4, 5, 6 (indices 3, 4, 5)
            if 3 <= rank <= 5:
                white_space += 1
        else:
            # Black pieces on ranks 3, 2, 1 (indices 2, 1, 0)
            if 0 <= rank <= 2:
                black_space += 1
    
    return white_space, black_space


# =============================================================================
# HELPER: GAME PHASE DETECTION
# =============================================================================

def get_game_phase(ply_count: Optional[int] = None, board: Optional[chess.Board] = None) -> str:
    """
    Determine game phase based on ply count and/or material.
    
    - Opening: ply 1-20 (moves 1-10) or many pieces on board
    - Middlegame: ply 21-60 (moves 11-30)
    - Endgame: ply 61+ (moves 31+) or few pieces remaining
    
    Args:
        ply_count: Number of half-moves played
        board: Optional board for material-based detection
        
    Returns:
        "opening", "middlegame", or "endgame"
    """
    # Ply-based detection
    if ply_count is not None:
        if ply_count <= 20:
            return "opening"
        elif ply_count <= 60:
            return "middlegame"
        else:
            return "endgame"
    
    # Material-based detection (fallback)
    if board:
        # Count pieces (not pawns)
        piece_count = 0
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece and piece.piece_type != chess.PAWN and piece.piece_type != chess.KING:
                piece_count += 1
        
        if piece_count >= 10:
            return "opening"
        elif piece_count >= 4:
            return "middlegame"
        else:
            return "endgame"
    
    return "middlegame"  # Default


# =============================================================================
# HELPER: CASTLING INFO DETECTION
# =============================================================================

def detect_castling_info(board: chess.Board) -> Dict[str, Any]:
    """
    Analyze castling status for both sides.
    
    Returns:
        Dict with castling information for both colors
    """
    def can_castle_soon(color: bool, kingside: bool) -> bool:
        """Check if castling is plausible (rights exist, path clearable)."""
        if kingside:
            has_rights = board.has_kingside_castling_rights(color)
        else:
            has_rights = board.has_queenside_castling_rights(color)
        return has_rights
    
    def has_castled(color: bool) -> bool:
        """Heuristic: king is on g1/g8 or c1/c8 suggests castling happened."""
        king_sq = board.king(color)
        if king_sq is None:
            return False
        file = chess.square_file(king_sq)
        # g-file = 6, c-file = 2
        return file in [6, 2]
    
    return {
        "white_castled": has_castled(chess.WHITE),
        "black_castled": has_castled(chess.BLACK),
        "white_can_castle_kingside": board.has_kingside_castling_rights(chess.WHITE),
        "white_can_castle_queenside": board.has_queenside_castling_rights(chess.WHITE),
        "black_can_castle_kingside": board.has_kingside_castling_rights(chess.BLACK),
        "black_can_castle_queenside": board.has_queenside_castling_rights(chess.BLACK),
        "white_lost_castling": not (board.has_kingside_castling_rights(chess.WHITE) or 
                                    board.has_queenside_castling_rights(chess.WHITE)),
        "black_lost_castling": not (board.has_kingside_castling_rights(chess.BLACK) or 
                                    board.has_queenside_castling_rights(chess.BLACK)),
    }


# =============================================================================
# HELPER: ATTACKS AND THREATS DETECTION
# =============================================================================

def detect_attacks_and_threats(board: chess.Board) -> Dict[str, Any]:
    """
    Detect attack patterns and threats in the position.
    
    Returns:
        Dict with attack/threat information
    """
    result = {
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "white_attacking_king": False,
        "black_attacking_king": False,
        "threat_squares": [],
    }
    
    # Check if white is attacking black's king
    black_king_sq = board.king(chess.BLACK)
    if black_king_sq is not None:
        white_attackers = board.attackers(chess.WHITE, black_king_sq)
        result["white_attacking_king"] = len(white_attackers) > 0
    
    # Check if black is attacking white's king
    white_king_sq = board.king(chess.WHITE)
    if white_king_sq is not None:
        black_attackers = board.attackers(chess.BLACK, white_king_sq)
        result["black_attacking_king"] = len(black_attackers) > 0
    
    # Find squares under attack near the opponent's king
    side_to_move = board.turn
    opponent_king_sq = board.king(not side_to_move)
    
    if opponent_king_sq is not None:
        king_zone = []
        king_file = chess.square_file(opponent_king_sq)
        king_rank = chess.square_rank(opponent_king_sq)
        
        for df in [-1, 0, 1]:
            for dr in [-1, 0, 1]:
                f, r = king_file + df, king_rank + dr
                if 0 <= f <= 7 and 0 <= r <= 7:
                    sq = chess.square(f, r)
                    if board.attackers(side_to_move, sq):
                        king_zone.append(chess.square_name(sq))
        
        result["threat_squares"] = king_zone
    
    return result


# =============================================================================
# HELPER: VERDICT AND SUMMARY
# =============================================================================

def build_verdict_from_eval(eval_score: float, ply_count: Optional[int] = None) -> Tuple[str, str]:
    """
    Map eval_score to verdict and summary strings.
    
    Args:
        eval_score: Heuristic evaluation score
        ply_count: Optional ply count for initial position detection
        
    Returns:
        (verdict, summary) tuple
    """
    # Initial position special case
    if ply_count is not None and ply_count == 0:
        return ("equal", "Game start")
    
    # Map to tier first
    abs_eval = abs(eval_score)
    side = "white" if eval_score >= 0 else "black"
    
    for threshold, tier_name in TIER_THRESHOLDS:
        if abs_eval <= threshold:
            if tier_name == "equal":
                verdict = "equal"
            else:
                verdict = f"{side}_{tier_name}"
            break
    else:
        verdict = f"{side}_winning"
    
    # Get summary from templates
    summary = SUMMARY_TEMPLATES.get(verdict, "The position is unclear.")
    
    return verdict, summary


# =============================================================================
# HELPER: BUILD META INFO
# =============================================================================

def build_meta_info(
    board: Optional[chess.Board] = None,
    ply_count: Optional[int] = None,
    eco_code: Optional[str] = None,
    eco_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Build comprehensive meta information about the position.
    
    Args:
        board: Chess board for analysis
        ply_count: Number of plies played
        eco_code: ECO code if known
        eco_name: Opening name if known
        
    Returns:
        Dict with game_phase, castling_info, attacks_and_threats, eco
    """
    meta = {
        "game_phase": get_game_phase(ply_count, board),
        "castling_info": {},
        "attacks_and_threats": {},
        "eco": None,
    }
    
    if board:
        meta["castling_info"] = detect_castling_info(board)
        meta["attacks_and_threats"] = detect_attacks_and_threats(board)
    
    if eco_code or eco_name:
        meta["eco"] = {
            "code": eco_code,
            "name": eco_name,
        }
    
    return meta


def _compute_equity_percentages(
    white_score: float,
    black_score: float,
    ply_count: Optional[int],
    heuristics: Dict[str, Any],
    meta: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute the UI 'equity' split as a stable, symmetric percentage.

    Key properties:
    - If white_score == black_score -> 50/50
    - Uses score delta, not an asymmetric ratio
    - In early opening, neutralize to 50/50 unless a decisive tactic exists
    
    Returns:
        {"white": int, "black": int, "source": str}
    """
    # Early opening neutralization unless there is a real tactical reason not to
    is_early_opening = ply_count is not None and ply_count <= 10

    tension = heuristics.get("tension") or {}
    has_winning_capture = bool(tension.get("has_winning_capture", False))
    has_true_hanging = bool(tension.get("has_true_hanging_piece", False))
    trapped = bool(heuristics.get("trapped_piece", False))

    attacks = (meta or {}).get("attacks_and_threats") or {}
    is_check = bool(attacks.get("is_check", False))
    is_mate = bool(attacks.get("is_checkmate", False))

    decisive = has_winning_capture or has_true_hanging or trapped or is_check or is_mate

    if is_early_opening and not decisive:
        return {"white": 50, "black": 50, "source": "heuristic_opening_neutral"}

    total = float(white_score) + float(black_score)
    if total <= 0:
        return {"white": 50, "black": 50, "source": "heuristic"}

    # Symmetric mapping: 50% when scores equal
    delta = float(white_score) - float(black_score)
    white_pct = 50.0 + 50.0 * (delta / total)

    # Clamp to avoid ugly 0/100 UI
    white_pct = int(round(max(1.0, min(99.0, white_pct))))
    black_pct = 100 - white_pct
    return {"white": white_pct, "black": black_pct, "source": "heuristic"}


def generate_concept_tags(
    heuristics: Dict[str, Any],
    meta: Dict[str, Any],
    ply_count: Optional[int] = None,
) -> List[Dict[str, str]]:
    """
    Generate chess.com-style concept tags for the UI.
    
    Tags are ordered by relevance/importance.
    Each tag has: key, label, tone (neutral/good_for_white/good_for_black/warning)
    
    Returns:
        List of tag dicts to display as pills in the UI.
    """
    tags = []
    
    # Game phase tag
    game_phase = meta.get("game_phase", "")
    if game_phase:
        tags.append({
            "key": "phase",
            "label": game_phase,
            "tone": "neutral",
        })
    
    # Tension/tactical tags
    tension = heuristics.get("tension", {})
    
    if tension.get("has_true_hanging_piece"):
        tags.append({
            "key": "hanging",
            "label": "hanging piece",
            "tone": "warning",
        })
    elif tension.get("has_winning_capture"):
        tags.append({
            "key": "winning_capture",
            "label": "winning capture",
            "tone": "warning",
        })
    elif tension.get("has_trade_available"):
        tags.append({
            "key": "tension",
            "label": "tension",
            "tone": "neutral",
        })
    
    # Trapped piece tag (only with evidence)
    trapped_candidates = heuristics.get("trapped_candidates", [])
    truly_trapped = [c for c in trapped_candidates if c.get("is_truly_trapped")]
    if truly_trapped:
        color = truly_trapped[0].get("color", "")
        tags.append({
            "key": "trapped",
            "label": f"trapped {truly_trapped[0].get('piece', 'piece')}",
            "tone": f"good_for_{'black' if color == 'white' else 'white'}",
        })
    
    # Development tag (opening only)
    if ply_count is not None and ply_count <= 15:
        dev_lead = None
        facts = heuristics.get("position_facts", {})
        development = facts.get("development", {})
        
        white_dev = development.get("white_development_score", 0.5)
        black_dev = development.get("black_development_score", 0.5)
        
        if white_dev - black_dev >= 0.25:
            dev_lead = "white"
        elif black_dev - white_dev >= 0.25:
            dev_lead = "black"
        
        if dev_lead:
            tags.append({
                "key": "development",
                "label": "development lead",
                "tone": f"good_for_{dev_lead}",
            })
    
    # Castling status
    castling = meta.get("castling_info", {})
    if castling.get("white_castled") and not castling.get("black_castled"):
        tags.append({
            "key": "castling",
            "label": "white castled",
            "tone": "good_for_white",
        })
    elif castling.get("black_castled") and not castling.get("white_castled"):
        tags.append({
            "key": "castling",
            "label": "black castled",
            "tone": "good_for_black",
        })
    
    # Check/mate
    attacks = meta.get("attacks_and_threats", {})
    if attacks.get("is_checkmate"):
        tags.append({
            "key": "checkmate",
            "label": "checkmate",
            "tone": "warning",
        })
    elif attacks.get("is_check"):
        tags.append({
            "key": "check",
            "label": "check",
            "tone": "warning",
        })
    
    # Limit tags to avoid clutter
    return tags[:5]

def score_position_from_heuristics(
    heuristics: Dict[str, Any],
    board: Optional[chess.Board] = None,
    white_to_move: bool = True,
    ply_count: Optional[int] = None  # NEW: for phase dampening
) -> Tuple[float, float, float]:
    """
    Score a position based on heuristics dictionary.
    
    Scoring Formula:
    - Tactical patterns: Add weight to side with advantage
    - Pawn structure: Add/subtract based on pawn quality
    - Positional features: Add weight for outposts, subtract for weak squares
    - Mobility: Per-color (not side-to-move) * weight
    - Space: Bonus for space advantage
    - Phase dampening: Opening scores reduced to prevent false advantages
    
    Args:
        heuristics: Dictionary from heuristics_service.calculate_position_heuristics()
        board: Optional chess.Board for space calculation (if None, skips space)
        white_to_move: True if white to move (determines who benefits from tactics)
        ply_count: Optional ply count for phase-based dampening
    
    Returns:
        (white_score, black_score, eval) where eval = white_score - black_score
    """
    white_score = 0
    black_score = 0
    
    # Determine which side benefits from tactical patterns
    # If it's white's turn, white would exploit hanging pieces, etc.
    beneficiary_white = white_to_move
    
    # -------------------------------------------------------------------------
    # TACTICAL SCORING (with tension-aware logic)
    # -------------------------------------------------------------------------
    
    # Check if we have tension analysis (new system)
    tension = heuristics.get("tension", {})
    has_tension_analysis = bool(tension.get("targets"))
    
    if has_tension_analysis:
        # NEW: Use refined tension-based scoring
        # Only count hanging_piece if it's truly hanging (not just trade/tension)
        if tension.get("has_true_hanging_piece", False):
            if beneficiary_white:
                white_score += TACTICAL_WEIGHTS_TENSION["true_hanging"]
            else:
                black_score += TACTICAL_WEIGHTS_TENSION["true_hanging"]
        
        # Winning capture is significant
        if heuristics.get("winning_capture", False):
            if beneficiary_white:
                white_score += TACTICAL_WEIGHTS_TENSION["winning_capture"]
            else:
                black_score += TACTICAL_WEIGHTS_TENSION["winning_capture"]
        
        # Trade available is minor (doesn't inflate eval)
        if heuristics.get("trade_available", False):
            if beneficiary_white:
                white_score += TACTICAL_WEIGHTS_TENSION["trade_available"]
            else:
                black_score += TACTICAL_WEIGHTS_TENSION["trade_available"]
        
        # Threatened piece is minor
        if heuristics.get("threatened_piece", False):
            if beneficiary_white:
                white_score += TACTICAL_WEIGHTS_TENSION["threatened_piece"]
            else:
                black_score += TACTICAL_WEIGHTS_TENSION["threatened_piece"]
        
        # Process other tactical patterns (fork, pin, etc.) - excluding hanging_piece
        for pattern, weight in TACTICAL_WEIGHTS.items():
            if pattern == "hanging_piece":
                continue  # Already handled via tension analysis
            if heuristics.get(pattern, False):
                if beneficiary_white:
                    white_score += weight
                else:
                    black_score += weight
    else:
        # LEGACY: Fall back to old behavior when no tension analysis
        for pattern, weight in TACTICAL_WEIGHTS.items():
            if heuristics.get(pattern, False):
                if beneficiary_white:
                    white_score += weight
                else:
                    black_score += weight
    
    # -------------------------------------------------------------------------
    # PAWN STRUCTURE SCORING
    # -------------------------------------------------------------------------
    
    pawn_structure = heuristics.get("pawn_structure", {})
    
    # Passed pawns benefit the owner
    passed_pawns = pawn_structure.get("passed_pawns", [])
    for pawn_sq in passed_pawns:
        # Determine color from rank (white passed pawns on higher ranks)
        if board:
            square = chess.parse_square(pawn_sq)
            piece = board.piece_at(square)
            if piece and piece.color == chess.WHITE:
                white_score += PAWN_WEIGHTS["passed_pawn"]
            elif piece:
                black_score += PAWN_WEIGHTS["passed_pawn"]
        else:
            # Without board, assume equal distribution
            rank = int(pawn_sq[1])
            if rank >= 4:
                white_score += PAWN_WEIGHTS["passed_pawn"]
            else:
                black_score += PAWN_WEIGHTS["passed_pawn"]
    
    # Doubled pawns are weaknesses
    doubled_pawns = pawn_structure.get("doubled_pawns", [])
    for pawn_sq in doubled_pawns:
        if board:
            square = chess.parse_square(pawn_sq)
            piece = board.piece_at(square)
            if piece and piece.color == chess.WHITE:
                white_score += PAWN_WEIGHTS["doubled_pawn"]  # Negative weight
            elif piece:
                black_score += PAWN_WEIGHTS["doubled_pawn"]
        else:
            rank = int(pawn_sq[1])
            if rank >= 4:
                white_score += PAWN_WEIGHTS["doubled_pawn"]
            else:
                black_score += PAWN_WEIGHTS["doubled_pawn"]
    
    # Isolated pawns are weaknesses
    isolated_pawns = pawn_structure.get("isolated_pawns", [])
    for pawn_sq in isolated_pawns:
        if board:
            square = chess.parse_square(pawn_sq)
            piece = board.piece_at(square)
            if piece and piece.color == chess.WHITE:
                white_score += PAWN_WEIGHTS["isolated_pawn"]  # Negative weight
            elif piece:
                black_score += PAWN_WEIGHTS["isolated_pawn"]
        else:
            rank = int(pawn_sq[1])
            if rank >= 4:
                white_score += PAWN_WEIGHTS["isolated_pawn"]
            else:
                black_score += PAWN_WEIGHTS["isolated_pawn"]
    
    # -------------------------------------------------------------------------
    # POSITIONAL SCORING
    # -------------------------------------------------------------------------
    
    # Weak squares affect the side to move negatively
    weak_squares = heuristics.get("weak_squares", [])
    weak_penalty = len(weak_squares) * POSITIONAL_WEIGHTS["weak_square"]
    if white_to_move:
        # Weak squares hurt white if it's their turn (opponent controls them)
        black_score += weak_penalty
    else:
        white_score += weak_penalty
    
    # Outposts benefit the side to move
    outposts = heuristics.get("outposts", [])
    outpost_bonus = len(outposts) * POSITIONAL_WEIGHTS["outpost"]
    if white_to_move:
        white_score += outpost_bonus
    else:
        black_score += outpost_bonus
    
    # -------------------------------------------------------------------------
    # MOBILITY SCORING (now color-based, not side-to-move)
    # -------------------------------------------------------------------------
    
    mobility = heuristics.get("mobility_score", {})
    
    # Handle both old (int) and new (dict) mobility format for backwards compat
    if isinstance(mobility, dict):
        # New format: score each side independently
        white_mobility = mobility.get("white", 0)
        black_mobility = mobility.get("black", 0)
        white_score += white_mobility * MOBILITY_WEIGHT
        black_score += black_mobility * MOBILITY_WEIGHT
    else:
        # Legacy format: was side-to-move based, but we'll now distribute evenly
        # This is a fallback and shouldn't be hit with new code
        white_score += (mobility / 2) * MOBILITY_WEIGHT
        black_score += (mobility / 2) * MOBILITY_WEIGHT
    
    # -------------------------------------------------------------------------
    # SPACE ADVANTAGE
    # -------------------------------------------------------------------------
    
    if board:
        white_space, black_space = _calculate_space_advantage(board)
        if white_space > black_space:
            white_score += SPACE_ADVANTAGE_WEIGHT
        elif black_space > white_space:
            black_score += SPACE_ADVANTAGE_WEIGHT
    
    # -------------------------------------------------------------------------
    # COMPUTE FINAL EVAL
    # -------------------------------------------------------------------------
    
    eval_score = white_score - black_score
    
    # -------------------------------------------------------------------------
    # PHASE DAMPENING (prevents false advantages in opening)
    # -------------------------------------------------------------------------
    
    # Determine if we're in opening (first ~10 plies)
    is_early_opening = ply_count is not None and ply_count <= 10
    has_tactical_win = (
        heuristics.get("winning_capture", False) or
        heuristics.get("fork", False) or
        heuristics.get("trapped_piece", False) or
        tension.get("has_true_hanging_piece", False)
    )
    
    if is_early_opening and not has_tactical_win:
        # Apply opening dampening factor (0.6x)
        OPENING_DAMPEN = 0.6
        white_score = white_score * OPENING_DAMPEN
        black_score = black_score * OPENING_DAMPEN
        eval_score = white_score - black_score
        
        # Hard clamp to prevent "clear advantage" from soft factors
        OPENING_CLAMP = 15  # Within "equal" tier (threshold is 15)
        eval_score = max(-OPENING_CLAMP, min(OPENING_CLAMP, eval_score))
    
    return white_score, black_score, eval_score


# =============================================================================
# TIER MAPPING
# =============================================================================

def map_eval_to_tier(eval_score: int) -> str:
    """
    Map evaluation score to a tier string.
    
    Thresholds (Chess.com-like):
        |eval| ≤ 4         → equal
        5–12               → white_slightly_better / black_slightly_better
        13–25              → white_better / black_better
        26–45              → white_much_better / black_much_better
        ≥ 46               → white_winning / black_winning
    
    Args:
        eval_score: Integer evaluation (positive = white advantage)
    
    Returns:
        Tier string like "equal", "white_slightly_better", "black_winning", etc.
    """
    abs_eval = abs(eval_score)
    side = "white" if eval_score >= 0 else "black"
    
    for threshold, tier_name in TIER_THRESHOLDS:
        if abs_eval <= threshold:
            if tier_name == "equal":
                return "equal"
            return f"{side}_{tier_name}"
    
    # Fallback (shouldn't reach here)
    return f"{side}_winning"


# =============================================================================
# COMMENTARY GENERATION (pattern-aware)
# =============================================================================

def generate_commentary(
    tier: str,
    heuristics: Optional[Dict[str, Any]] = None,
    fen: Optional[str] = None,
    ply_count: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None
) -> str:
    """
    Generate human-readable commentary based on tier and detected patterns.
    
    Priority:
    1. Tactical patterns (fork, pin, hanging piece, etc.)
    2. Pawn structure issues (passed pawns, isolated pawns)
    3. Game phase + ECO opening info (for early/mid game)
    4. Opening-specific commentary (for early game)
    5. Generic tier-based commentary (fallback)
    
    Args:
        tier: Tier string from map_eval_to_tier()
        heuristics: Optional heuristics dict with detected patterns
        fen: Optional FEN string for deterministic randomization
        ply_count: Optional number of plies played (for opening detection)
        meta: Optional meta info dict with game_phase, castling_info, eco
    
    Returns:
        Human-readable commentary string describing the position
    """
    # Helper for deterministic selection
    def pick_template(templates: list, seed: str = "") -> str:
        if not templates:
            return ""
        if fen or seed:
            hash_input = (fen or "") + seed
            hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
            return templates[hash_value % len(templates)]
        return templates[0]
    
    # Extract meta info
    game_phase = meta.get("game_phase", "opening") if meta else "opening"
    castling_info = meta.get("castling_info", {}) if meta else {}
    eco_info = meta.get("eco") if meta else None
    attacks_info = meta.get("attacks_and_threats", {}) if meta else {}
    
    # Priority 1: Check for tactical patterns (but not in early opening where
    # detection often has false positives)
    is_early_game = ply_count is not None and ply_count <= 6
    
    if heuristics and not is_early_game:
        # Check tension analysis first (new system)
        tension = heuristics.get("tension", {})
        has_tension_analysis = bool(tension.get("targets"))
        
        if has_tension_analysis:
            # PRIORITY 0: True hanging piece or winning capture (real tactical opportunity)
            if tension.get("has_true_hanging_piece", False):
                templates = PATTERN_COMMENTARY.get("hanging_piece", [])
                if templates:
                    base_comment = pick_template(templates, "hanging")
                    if game_phase == "opening" and eco_info and eco_info.get("name"):
                        return f"{base_comment} This arises from the {eco_info['name']}."
                    return base_comment
            
            if tension.get("has_winning_capture", False):
                templates = PATTERN_COMMENTARY.get("winning_capture", [])
                if templates:
                    return pick_template(templates, "winning_capture")
            
            # PRIORITY 0.5: Tension/trade (not hanging - use softer language)
            if tension.get("has_trade_available", False):
                templates = PATTERN_COMMENTARY.get("tension_trade", [])
                if templates:
                    # Don't mention tension in very early game
                    if ply_count is None or ply_count > 10:
                        return pick_template(templates, "tension")
        
        # Most impactful tactical patterns
        # Note: trapped_piece is handled separately with evidence check
        tactical_patterns = [
            "fork", "pin", "skewer"
        ]
        
        # Only add hanging_piece if we DON'T have tension analysis (legacy mode)
        if not has_tension_analysis:
            tactical_patterns.insert(1, "hanging_piece")
        
        for pattern in tactical_patterns:
            if heuristics.get(pattern, False):
                templates = PATTERN_COMMENTARY.get(pattern, [])
                if templates:
                    base_comment = pick_template(templates, pattern)
                    # Add ECO context if in opening
                    if game_phase == "opening" and eco_info and eco_info.get("name"):
                        return f"{base_comment} This arises from the {eco_info['name']}."
                    return base_comment
        
        # TRAPPED PIECE: Only claim "trapped" if we have evidence (truly trapped)
        trapped_candidates = heuristics.get("trapped_candidates", [])
        truly_trapped = [c for c in trapped_candidates if c.get("is_truly_trapped", False)]
        if truly_trapped:
            trapped = truly_trapped[0]
            piece_names = {"P": "pawn", "N": "knight", "B": "bishop", 
                          "R": "rook", "Q": "queen", "K": "king"}
            piece_name = piece_names.get(trapped.get("piece", "?"), "piece")
            square = trapped.get("square", "")
            color = trapped.get("color", "")
            escape_count = trapped.get("num_escape_moves", 0)
            
            # Fact-grounded commentary: mention square and escape count
            return f"The {color} {piece_name} on {square} is trapped with no safe escape squares."
        
        # Check king safety
        if heuristics.get("king_safety_drop", False):
            templates = PATTERN_COMMENTARY.get("king_safety_drop", [])
            if templates:
                return pick_template(templates, "king_safety")
        
        # Check for attacks on king zone
        if attacks_info.get("white_attacking_king") or attacks_info.get("black_attacking_king"):
            if attacks_info.get("is_check"):
                return "The king is in check!"
            assault_side = "White" if attacks_info.get("white_attacking_king") else "Black"
            if game_phase == "middlegame":
                return f"{assault_side} is building pressure on the king."
        
        # Priority 2: Pawn structure issues (also skip in early game)
        pawn_structure = heuristics.get("pawn_structure", {})
        
        # Passed pawns (most significant in endgame)
        passed_pawns = pawn_structure.get("passed_pawns", [])
        if passed_pawns:
            templates = PATTERN_COMMENTARY.get("passed_pawn", [])
            if templates:
                base = pick_template(templates, "passed")
                if game_phase == "endgame":
                    return f"{base} {pick_template(PHASE_COMMENTARY['endgame']['passed_pawn'], 'endgame_passed')}"
                return base
        
        # Isolated pawns (skip if early game - structure hasn't formed yet)
        isolated_pawns = pawn_structure.get("isolated_pawns", [])
        if len(isolated_pawns) >= 2:  # Only mention if multiple
            templates = PATTERN_COMMENTARY.get("isolated_pawn", [])
            if templates:
                return pick_template(templates, "isolated")
        
        # Doubled pawns (skip if early game)
        doubled_pawns = pawn_structure.get("doubled_pawns", [])
        if len(doubled_pawns) >= 2:  # Only mention if relevant
            templates = PATTERN_COMMENTARY.get("doubled_pawn", [])
            if templates:
                return pick_template(templates, "doubled")
    
    # Priority 3: ECO-aware commentary (opening phase only)
    if game_phase == "opening" and eco_info and eco_info.get("name"):
        eco_name = eco_info.get("name")
        eco_code = eco_info.get("code", "")
        if tier == "equal":
            return f"A standard position from the {eco_name} ({eco_code})."
        else:
            side = "White" if "white" in tier else "Black"
            return f"In the {eco_name}, {side.lower()} has an edge here."
    
    # Priority 4: Phase-specific commentary
    if game_phase == "middlegame" and tier != "equal":
        templates = PHASE_COMMENTARY.get("middlegame", {}).get("general", [])
        if templates:
            return pick_template(templates, "middlegame")
    
    if game_phase == "endgame":
        templates = PHASE_COMMENTARY.get("endgame", {}).get("general", [])
        if templates:
            return pick_template(templates, "endgame")
    
    # Priority 5: Opening-specific commentary (first ~10 moves)
    if ply_count is not None and ply_count <= 10 and tier == "equal":
        templates = OPENING_COMMENTARY.get("equal", [])
        if templates:
            return pick_template(templates, "opening")
    
    # Priority 6: Generic tier-based fallback
    templates = TIER_COMMENTARY_TEMPLATES.get(tier, TIER_COMMENTARY_TEMPLATES["equal"])
    return pick_template(templates, "tier")


# Legacy compatibility wrapper
def commentary_from_tier(tier: str, fen: Optional[str] = None) -> str:
    """
    Legacy function - generates tier-based commentary without pattern awareness.
    For full pattern-aware commentary, use generate_commentary() instead.
    """
    return generate_commentary(tier, heuristics=None, fen=fen, ply_count=None)


# =============================================================================
# PUBLIC API FUNCTION
# =============================================================================

def evaluate_position_from_heuristics(
    heuristics: Dict[str, Any],
    white_to_move: bool = True,
    fen: Optional[str] = None,
    board: Optional[chess.Board] = None,
    ply_count: Optional[int] = None,
    eco_code: Optional[str] = None,
    eco_name: Optional[str] = None,
    pre_move_fen: Optional[str] = None,
    move_san: Optional[str] = None
) -> Dict[str, Any]:
    """
    Complete position evaluation from heuristics.
    
    This is the main public function that combines scoring, tier mapping,
    pattern-aware commentary generation, and meta information.
    
    Args:
        heuristics: Dictionary from heuristics_service.calculate_position_heuristics()
        white_to_move: True if white to move
        fen: Optional FEN string for deterministic commentary
        board: Optional chess.Board for space calculation
        ply_count: Optional number of plies played (affects commentary)
        eco_code: Optional ECO code for opening identification
        eco_name: Optional opening name
        pre_move_fen: Optional FEN before the move
        move_san: Optional SAN of the last move
    
    Returns:
        {
            "advantage": tier_string,
            "commentary": human_readable_text,
            "white_score": number,
            "black_score": number,
            "eval": number,
            "verdict": verdict_string,
            "summary": one_line_summary,
            "meta": {...}
        }
    """
    # If FEN provided but no board, create board
    if fen and board is None:
        try:
            board = chess.Board(fen)
        except Exception:
            board = None
    
    # Score the position (now with ply_count for phase dampening)
    white_score, black_score, eval_score = score_position_from_heuristics(
        heuristics, board, white_to_move, ply_count
    )
    
    # Map to tier
    tier = map_eval_to_tier(eval_score)
    
    # Build verdict and summary
    verdict, summary = build_verdict_from_eval(eval_score, ply_count)
    
    # Build meta information
    meta = build_meta_info(
        board=board,
        ply_count=ply_count,
        eco_code=eco_code,
        eco_name=eco_name
    )
    
    # --------------------------------------------------------------------------
    # COMMENTARY GENERATION (Static Pattern-Aware)
    # --------------------------------------------------------------------------
    commentary = generate_commentary(
        tier=tier,
        heuristics=heuristics,
        fen=fen,
        ply_count=ply_count,
        meta=meta
    )
    
    # --------------------------------------------------------------------------
    # NARRATOR UPGRADE (Move-Aware Narrator)
    # --------------------------------------------------------------------------
    # If we have move history, use the more sophisticated narrator
    narrator_headline = None
    if pre_move_fen and move_san and board:
        try:
            from .heuristic_narrator import render_non_llm_commentary
            from .heuristics_service import compute_move_facts
            
            # Reconstruct the move to get from/to squares
            prev_board = chess.Board(pre_move_fen)
            move_obj = prev_board.parse_san(move_san)
            from_sq = chess.square_name(move_obj.from_square)
            to_sq = chess.square_name(move_obj.to_square)
            
            # Compute rich move facts for the narrator
            move_facts = compute_move_facts(
                fen_before=pre_move_fen,
                fen_after=fen,
                move_from=from_sq,
                move_to=to_sq,
                move_san=move_san
            )
            
            if "error" not in move_facts:
                narrator_result = render_non_llm_commentary(
                    heuristics=heuristics,
                    ply_count=ply_count,
                    meta=meta,
                    fen=fen,
                    move_facts=move_facts,
                    last_move_san=move_san,
                )
                
                if narrator_result and "text" in narrator_result:
                    # Use narrator's text if it's substantial
                    commentary = narrator_result["text"]
                    narrator_headline = narrator_result.get("headline")
        except Exception:
            # Fallback to static commentary on any error
            pass

    # Add tension info to meta if available (new field)
    if "tension" in heuristics:
        meta["tension"] = heuristics["tension"]
    
    # Compute equity percentages for UI display (symmetric, stable)
    equity = _compute_equity_percentages(
        white_score=white_score,
        black_score=black_score,
        ply_count=ply_count,
        heuristics=heuristics,
        meta=meta,
    )
    
    # Generate concept tags for UI pills
    tags = generate_concept_tags(
        heuristics=heuristics,
        meta=meta,
        ply_count=ply_count,
    )
    
    # Get chess.com-style headline from tier mapping
    tier_ui = TIER_TO_UI.get(tier, {"headline": summary, "icon": "balance", "tone": "neutral"})
    headline = narrator_headline or tier_ui["headline"]
    
    # Build evidence object (for debugging/transparency)
    evidence = {}
    if "tension" in heuristics:
        evidence["tension"] = heuristics["tension"]
    if "trapped_candidates" in heuristics:
        evidence["trapped"] = heuristics["trapped_candidates"]
    if "position_facts" in heuristics:
        evidence["facts"] = heuristics["position_facts"]
    
    result = {
        "advantage": tier,
        "headline": headline,  # NEW: chess.com-style headline
        "commentary": commentary,
        "white_score": white_score,
        "black_score": black_score,
        "eval": eval_score,
        "verdict": verdict,
        "summary": summary,
        "equity": equity,
        "tags": tags,  # NEW: concept tags for UI pills
        "evidence": evidence,  # NEW: structured evidence
        "meta": meta,
    }
    
    # ==========================================================================
    # NON-LLM COMMENTARY INTEGRATION (additive, feature-flagged)
    # ==========================================================================
    # When ENABLE_NON_LLM_COMMENTARY=1, inject YAML-driven commentary and affordances
    # This is strictly additive - when flag is OFF, this code path is not executed
    try:
        from gateway_modules.non_llm_commentary.config import ENABLE_NON_LLM_COMMENTARY
        if ENABLE_NON_LLM_COMMENTARY:
            from gateway_modules.non_llm_commentary import generate_non_llm_commentary
            
            # Extract position_facts for rule evaluation
            position_facts = heuristics.get("position_facts", {})
            position_facts["game_phase"] = meta.get("game_phase", "middlegame")
            
            non_llm = generate_non_llm_commentary(
                heuristics=heuristics,
                position_facts=position_facts,
                fen=fen,
            )
            
            if non_llm:
                result["non_llm_commentary"] = non_llm
    except ImportError:
        # Module not available - gracefully skip
        pass
    except Exception:
        # Any error in non_llm_commentary should not break main flow
        pass
    
    return result

