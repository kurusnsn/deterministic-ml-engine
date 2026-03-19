"""
Heuristics calculation service for chess positions.
Detects tactical patterns, positional features, and pawn structure.
"""

import chess
from typing import Dict, Any, List, Set, Optional, Tuple


# =============================================================================
# PIECE VALUES FOR SEE (Static Exchange Evaluation)
# =============================================================================

PIECE_VALUES_CP = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 320,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,  # High value so king captures always appear "winning"
}

# Piece type to display symbol
PIECE_SYMBOLS = {
    chess.PAWN: "P",
    chess.KNIGHT: "N",
    chess.BISHOP: "B",
    chess.ROOK: "R",
    chess.QUEEN: "Q",
    chess.KING: "K",
}

# Thresholds for classifying SEE results
SEE_WINNING_THRESHOLD = 80    # cp gain to count as "winning capture"
SEE_LOSING_THRESHOLD = -80    # cp loss to count as "losing capture"
SEE_EQUAL_BAND = 50           # within ±50cp is "equal trade"


# =============================================================================
# STATIC EXCHANGE EVALUATION (SEE)
# =============================================================================

def _get_least_valuable_attacker(board: chess.Board, square: chess.Square, color: bool) -> Optional[chess.Square]:
    """
    Find the least valuable attacker of the given color attacking the square.
    
    Returns the square of the least valuable attacker, or None if no attackers.
    Respects pins (only considers legal captures).
    """
    attackers = board.attackers(color, square)
    if not attackers:
        return None
    
    # Sort by piece value (ascending) and return the least valuable
    min_value = float('inf')
    min_attacker = None
    
    for attacker_sq in attackers:
        piece = board.piece_at(attacker_sq)
        if piece is None:
            continue
        
        # Check if this capture would be legal (respects pins)
        capture_move = chess.Move(attacker_sq, square)
        # For pawns, check promotion
        if piece.piece_type == chess.PAWN:
            target_rank = chess.square_rank(square)
            if (color == chess.WHITE and target_rank == 7) or (color == chess.BLACK and target_rank == 0):
                # Promote to queen for SEE purposes
                capture_move = chess.Move(attacker_sq, square, promotion=chess.QUEEN)
        
        if capture_move in board.legal_moves:
            value = PIECE_VALUES_CP.get(piece.piece_type, 0)
            if value < min_value:
                min_value = value
                min_attacker = attacker_sq
    
    return min_attacker


def _compute_see(board: chess.Board, target_square: chess.Square, initial_attacker_sq: Optional[chess.Square] = None) -> int:
    """
    Static Exchange Evaluation: simulate capture sequence on a square.
    
    Computes the material gain/loss for the side to move if they initiate
    a capture on target_square. Uses the standard SEE algorithm:
    1. Capture with least valuable piece
    2. Opponent recaptures with their least valuable piece
    3. Repeat until no more captures possible
    4. Use negamax to determine optimal exchange result
    
    Args:
        board: Current position
        target_square: Square to evaluate captures on
        initial_attacker_sq: Optional specific attacker to start with
        
    Returns:
        Net material gain in centipawns for the side to move.
        Positive = winning capture, Negative = losing capture.
    """
    target_piece = board.piece_at(target_square)
    if target_piece is None:
        return 0
    
    # Find initial attacker
    side_to_move = board.turn
    
    if initial_attacker_sq is not None:
        attacker_sq = initial_attacker_sq
    else:
        attacker_sq = _get_least_valuable_attacker(board, target_square, side_to_move)
    
    if attacker_sq is None:
        return 0  # No legal capture available
    
    attacker_piece = board.piece_at(attacker_sq)
    if attacker_piece is None:
        return 0
    
    # Build the SEE gain list
    # gain[i] = value of piece captured in ply i
    gain = []
    
    # Make a copy to simulate captures
    temp_board = board.copy()
    current_target_value = PIECE_VALUES_CP.get(target_piece.piece_type, 0)
    current_attacker_value = PIECE_VALUES_CP.get(attacker_piece.piece_type, 0)
    current_side = side_to_move
    current_attacker_sq = attacker_sq
    
    # Simulate the capture sequence
    max_depth = 32  # Prevent infinite loops
    for depth in range(max_depth):
        gain.append(current_target_value)
        
        # The piece that just captured becomes the new target
        current_target_value = current_attacker_value
        
        # Make the capture on temp board
        target_sq = target_square
        capture_move = chess.Move(current_attacker_sq, target_sq)
        
        # Handle pawn promotion
        capturing_piece = temp_board.piece_at(current_attacker_sq)
        if capturing_piece and capturing_piece.piece_type == chess.PAWN:
            target_rank = chess.square_rank(target_sq)
            if (capturing_piece.color == chess.WHITE and target_rank == 7) or \
               (capturing_piece.color == chess.BLACK and target_rank == 0):
                capture_move = chess.Move(current_attacker_sq, target_sq, promotion=chess.QUEEN)
                current_target_value = PIECE_VALUES_CP[chess.QUEEN]  # Promoted piece value
        
        if capture_move not in temp_board.legal_moves:
            break
            
        temp_board.push(capture_move)
        
        # Switch sides
        current_side = not current_side
        
        # Find opponent's least valuable recapture
        next_attacker_sq = _get_least_valuable_attacker(temp_board, target_sq, current_side)
        if next_attacker_sq is None:
            break
        
        next_attacker = temp_board.piece_at(next_attacker_sq)
        if next_attacker is None:
            break
            
        current_attacker_sq = next_attacker_sq
        current_attacker_value = PIECE_VALUES_CP.get(next_attacker.piece_type, 0)
    
    # Negamax the gain list to find the optimal result
    # Work backwards: each side will only capture if it improves their position
    while len(gain) > 1:
        if len(gain) % 2 == 0:
            # Opponent's turn to decide (they minimize our gain)
            gain[-2] = min(gain[-2], gain[-2] - gain[-1])
        else:
            # Our turn to decide (we maximize our gain)
            gain[-2] = max(gain[-2], gain[-2] - gain[-1])
        gain.pop()
    
    return gain[0] if gain else 0


# =============================================================================
# TENSION ANALYSIS
# =============================================================================

def _analyze_tension_targets(board: chess.Board) -> Dict[str, Any]:
    """
    Analyze all pieces under attack and classify them.
    
    For each attacked piece, determine:
    - Is it defended?
    - What is the SEE value if captured?
    - Is it truly hanging, in tension, or a winning/losing capture?
    
    Returns:
        {
            "targets": [
                {
                    "square": "e4",
                    "piece": "N",
                    "color": "white",
                    "attackers_count": 2,
                    "defenders_count": 1,
                    "see_gain_cp": 0,
                    "status": "hanging" | "tension" | "winning_capture" | "losing_capture" | "equal_trade",
                    "recommended_label": "trade" | "threat" | "hangs"
                }
            ],
            "has_trade_available": bool,
            "has_winning_capture": bool,
            "has_true_hanging_piece": bool,
            "best_see_target": str | None  # square with highest |SEE|
        }
    """
    targets = []
    has_trade_available = False
    has_winning_capture = False
    has_true_hanging_piece = False
    best_see_target = None
    best_see_value = 0
    
    side_to_move = board.turn
    opponent = not side_to_move
    
    # Check each of opponent's pieces for attacks by side to move
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None or piece.piece_type == chess.KING:
            continue
        
        # We're interested in pieces that the side to move can capture
        if piece.color != opponent:
            continue
        
        attackers = board.attackers(side_to_move, square)
        if not attackers:
            continue
        
        # This piece is attacked
        defenders = board.attackers(opponent, square)
        attackers_count = len(attackers)
        defenders_count = len(defenders)
        
        # Compute SEE for the best capture on this square
        see_value = _compute_see(board, square)
        
        # Classify the status
        if defenders_count == 0 and see_value >= 0:
            # No defenders and capture doesn't lose material = truly hanging
            status = "hanging"
            recommended_label = "hangs"
            has_true_hanging_piece = True
        elif see_value >= SEE_WINNING_THRESHOLD:
            # Can win material even against defenders
            status = "winning_capture"
            recommended_label = "threat"
            has_winning_capture = True
        elif see_value <= SEE_LOSING_THRESHOLD:
            # Capturing would lose material
            status = "losing_capture"
            recommended_label = "trade"  # Could still trade, just unfavorable
        elif abs(see_value) <= SEE_EQUAL_BAND:
            # Roughly equal exchange
            status = "equal_trade"
            recommended_label = "trade"
            has_trade_available = True
        else:
            # Somewhere in between - tension
            status = "tension"
            recommended_label = "trade"
            has_trade_available = True
        
        # Track best SEE target for commentary
        if abs(see_value) > abs(best_see_value):
            best_see_value = see_value
        targets.append({
            "square": chess.square_name(square),
            "piece": PIECE_SYMBOLS.get(piece.piece_type, "?"),
            "color": "white" if piece.color == chess.WHITE else "black",
            "attackers_count": attackers_count,
            "defenders_count": defenders_count,
            "see_gain_cp": see_value,
            "status": status,
            "recommended_label": recommended_label,
        })
    
    return {
        "targets": targets,
        "has_trade_available": has_trade_available,
        "has_winning_capture": has_winning_capture,
        "has_true_hanging_piece": has_true_hanging_piece,
        "best_see_target": best_see_target,
    }

def compute_concept_scores(heuristics: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute relative importance scores (0.0 to 1.0) for various chess concepts.
    Used to prioritize commentary and tags.
    """
    scores = {}
    facts = heuristics.get("position_facts", {})
    tension = heuristics.get("tension", {})
    
    # 1. Tension/Tactics (High priority)
    # Score 1.0 if hanging/winning capture, 0.7 if trade available, else 0
    if tension.get("has_true_hanging_piece") or tension.get("has_winning_capture"):
        scores["tactics"] = 1.0
    elif tension.get("has_trade_available"):
        scores["tension"] = 0.7
    else:
        scores["tactics"] = 0.0
        scores["tension"] = 0.0
        
    # 2. Material Imbalance
    # Normalize diff_cp: 100cp = 0.5, 300cp = 0.8, 900cp = 1.0
    material = facts.get("material", {})
    diff = abs(material.get("diff_cp", 0))
    scores["material"] = min(1.0, diff / 500.0)
    
    # 3. Development (Opening only)
    phase = facts.get("phase", "")
    if phase == "opening":
        dev = facts.get("development", {})
        white_dev = dev.get("white_development_score", 0.0)
        black_dev = dev.get("black_development_score", 0.0)
        # Score based on asymmetry
        scores["development"] = min(1.0, abs(white_dev - black_dev) * 2.0)
    else:
        scores["development"] = 0.0
        
    # 4. King Safety
    # Score based on attacks on king zone
    king_safety = facts.get("king_safety", {})
    white_attacks = king_safety.get("white", {}).get("king_zone_attacked", 0)
    black_attacks = king_safety.get("black", {}).get("king_zone_attacked", 0)
    scores["king_safety"] = min(1.0, (white_attacks + black_attacks) / 4.0)
    
    # 5. Threats
    threats = facts.get("threats", {})
    if threats.get("is_check") or threats.get("is_checkmate"):
        scores["threats"] = 1.0
    elif threats.get("attacks_on_high_value"):
        scores["threats"] = 0.8
    else:
        scores["threats"] = 0.0
        
    return scores



# =============================================================================
# POSITION FACTS (Facts-First Analysis)
# =============================================================================

def compute_position_facts(board: chess.Board, ply_count: Optional[int] = None) -> Dict[str, Any]:
    """
    Compute structured facts about a chess position.
    
    This is the foundation for fact-grounded commentary that never
    makes unsupported claims. All facts are explicit and verifiable.
    
    Returns:
        {
            "material": {"white": {...}, "black": {...}, "diff_cp": int},
            "phase": "opening|middlegame|endgame",
            "development": {...},
            "castling": {...},
            "king_safety": {...},
            "center_control": {...},
            "threats": {...}
        }
    """
    facts = {}
    
    # -------------------------------------------------------------------------
    # MATERIAL
    # -------------------------------------------------------------------------
    white_material = {
        "pawns": len(board.pieces(chess.PAWN, chess.WHITE)),
        "knights": len(board.pieces(chess.KNIGHT, chess.WHITE)),
        "bishops": len(board.pieces(chess.BISHOP, chess.WHITE)),
        "rooks": len(board.pieces(chess.ROOK, chess.WHITE)),
        "queens": len(board.pieces(chess.QUEEN, chess.WHITE)),
    }
    black_material = {
        "pawns": len(board.pieces(chess.PAWN, chess.BLACK)),
        "knights": len(board.pieces(chess.KNIGHT, chess.BLACK)),
        "bishops": len(board.pieces(chess.BISHOP, chess.BLACK)),
        "rooks": len(board.pieces(chess.ROOK, chess.BLACK)),
        "queens": len(board.pieces(chess.QUEEN, chess.BLACK)),
    }
    
    white_total = (white_material["pawns"] * 100 + 
                   white_material["knights"] * 300 +
                   white_material["bishops"] * 320 +
                   white_material["rooks"] * 500 +
                   white_material["queens"] * 900)
    black_total = (black_material["pawns"] * 100 + 
                   black_material["knights"] * 300 +
                   black_material["bishops"] * 320 +
                   black_material["rooks"] * 500 +
                   black_material["queens"] * 900)
    
    facts["material"] = {
        "white": white_material,
        "black": black_material,
        "white_total_cp": white_total,
        "black_total_cp": black_total,
        "diff_cp": white_total - black_total,
    }
    
    # -------------------------------------------------------------------------
    # PHASE DETECTION
    # -------------------------------------------------------------------------
    # Determine game phase by material and ply count
    total_material = white_total + black_total
    
    if ply_count is not None and ply_count <= 12:
        phase = "opening"
    elif total_material <= 3000:  # Roughly when queens/rooks are off
        phase = "endgame"
    elif ply_count is not None and ply_count <= 25:
        phase = "opening"
    else:
        phase = "middlegame"
    
    facts["phase"] = phase
    
    # -------------------------------------------------------------------------
    # DEVELOPMENT
    # -------------------------------------------------------------------------
    # Count undeveloped minor pieces (still on starting squares)
    white_undeveloped = 0
    black_undeveloped = 0
    
    # White knights on b1/g1, bishops on c1/f1
    if board.piece_at(chess.B1) == chess.Piece(chess.KNIGHT, chess.WHITE):
        white_undeveloped += 1
    if board.piece_at(chess.G1) == chess.Piece(chess.KNIGHT, chess.WHITE):
        white_undeveloped += 1
    if board.piece_at(chess.C1) == chess.Piece(chess.BISHOP, chess.WHITE):
        white_undeveloped += 1
    if board.piece_at(chess.F1) == chess.Piece(chess.BISHOP, chess.WHITE):
        white_undeveloped += 1
    
    # Black knights on b8/g8, bishops on c8/f8
    if board.piece_at(chess.B8) == chess.Piece(chess.KNIGHT, chess.BLACK):
        black_undeveloped += 1
    if board.piece_at(chess.G8) == chess.Piece(chess.KNIGHT, chess.BLACK):
        black_undeveloped += 1
    if board.piece_at(chess.C8) == chess.Piece(chess.BISHOP, chess.BLACK):
        black_undeveloped += 1
    if board.piece_at(chess.F8) == chess.Piece(chess.BISHOP, chess.BLACK):
        black_undeveloped += 1
    
    # Development score: 0-1, higher is better (more developed)
    white_dev_score = 1.0 - (white_undeveloped / 4.0)
    black_dev_score = 1.0 - (black_undeveloped / 4.0)
    
    facts["development"] = {
        "white_undeveloped_minors": white_undeveloped,
        "black_undeveloped_minors": black_undeveloped,
        "white_development_score": round(white_dev_score, 2),
        "black_development_score": round(black_dev_score, 2),
    }
    
    # -------------------------------------------------------------------------
    # CASTLING
    # -------------------------------------------------------------------------
    # Detect if king has moved from starting square (proxy for castled)
    white_king_sq = board.king(chess.WHITE)
    black_king_sq = board.king(chess.BLACK)
    
    white_castled = white_king_sq in [chess.G1, chess.C1]  # Typical castled positions
    black_castled = black_king_sq in [chess.G8, chess.C8]
    
    white_king_moved = white_king_sq != chess.E1
    black_king_moved = black_king_sq != chess.E8
    
    facts["castling"] = {
        "white_castled": white_castled,
        "black_castled": black_castled,
        "white_can_castle_kingside": board.has_kingside_castling_rights(chess.WHITE),
        "white_can_castle_queenside": board.has_queenside_castling_rights(chess.WHITE),
        "black_can_castle_kingside": board.has_kingside_castling_rights(chess.BLACK),
        "black_can_castle_queenside": board.has_queenside_castling_rights(chess.BLACK),
        "white_king_moved": white_king_moved,
        "black_king_moved": black_king_moved,
    }
    
    # -------------------------------------------------------------------------
    # KING SAFETY
    # -------------------------------------------------------------------------
    def count_pawn_shield(king_sq: int, color: bool) -> int:
        """Count pawns in front of king (shield)."""
        if king_sq is None:
            return 0
        
        file = chess.square_file(king_sq)
        rank = chess.square_rank(king_sq)
        shield_rank = rank + 1 if color == chess.WHITE else rank - 1
        
        if shield_rank < 0 or shield_rank > 7:
            return 0
        
        count = 0
        for f in [max(0, file - 1), file, min(7, file + 1)]:
            shield_sq = chess.square(f, shield_rank)
            piece = board.piece_at(shield_sq)
            if piece and piece.piece_type == chess.PAWN and piece.color == color:
                count += 1
        return count
    
    def count_king_zone_attacks(king_sq: int, attacker_color: bool) -> int:
        """Count squares in king zone attacked by opponent."""
        if king_sq is None:
            return 0
        
        file = chess.square_file(king_sq)
        rank = chess.square_rank(king_sq)
        attacks = 0
        
        for df in [-1, 0, 1]:
            for dr in [-1, 0, 1]:
                f, r = file + df, rank + dr
                if 0 <= f <= 7 and 0 <= r <= 7:
                    sq = chess.square(f, r)
                    if board.is_attacked_by(attacker_color, sq):
                        attacks += 1
        return attacks
    
    facts["king_safety"] = {
        "white": {
            "pawn_shield": count_pawn_shield(white_king_sq, chess.WHITE),
            "king_zone_attacked": count_king_zone_attacks(white_king_sq, chess.BLACK),
        },
        "black": {
            "pawn_shield": count_pawn_shield(black_king_sq, chess.BLACK),
            "king_zone_attacked": count_king_zone_attacks(black_king_sq, chess.WHITE),
        },
    }
    
    # -------------------------------------------------------------------------
    # CENTER CONTROL
    # -------------------------------------------------------------------------
    center_squares = [chess.D4, chess.D5, chess.E4, chess.E5]
    extended_center = [chess.C3, chess.C4, chess.C5, chess.C6,
                       chess.D3, chess.D6, chess.E3, chess.E6,
                       chess.F3, chess.F4, chess.F5, chess.F6]
    
    white_center = sum(1 for sq in center_squares if board.is_attacked_by(chess.WHITE, sq))
    black_center = sum(1 for sq in center_squares if board.is_attacked_by(chess.BLACK, sq))
    
    facts["center_control"] = {
        "white": white_center,
        "black": black_center,
    }
    
    # -------------------------------------------------------------------------
    # THREATS
    # -------------------------------------------------------------------------
    is_check = board.is_check()
    is_checkmate = board.is_checkmate()
    
    # Find attacks on high-value pieces
    attacks_on_high_value = []
    high_value_types = [chess.QUEEN, chess.ROOK]
    
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece and piece.piece_type in high_value_types:
            attackers = board.attackers(not piece.color, square)
            if attackers:
                attacker_squares = [chess.square_name(sq) for sq in attackers]
                attacks_on_high_value.append({
                    "by": "black" if piece.color == chess.WHITE else "white",
                    "target": f"{'white' if piece.color == chess.WHITE else 'black'}_{PIECE_SYMBOLS.get(piece.piece_type, '?').lower()}",
                    "square": chess.square_name(square),
                    "attackers": attacker_squares[:3],  # Limit to 3
                })
    
    facts["threats"] = {
        "is_check": is_check,
        "is_checkmate": is_checkmate,
        "mate_threat": False,  # Would need deeper analysis
        "attacks_on_high_value": attacks_on_high_value[:3],  # Limit
    }
    
    return facts

def calculate_position_heuristics(
    fen: str, 
    board: Optional[chess.Board] = None,
    ply_count: Optional[int] = None
) -> Dict[str, Any]:
    """
    Calculate tactical and positional heuristics for a chess position.

    Args:
        fen: FEN string of the position
        board: Optional chess.Board object (will be created from FEN if not provided)
        ply_count: Optional ply count for phase detection

    Returns:
        Dictionary with all heuristic fields (see structure in spec section 1.2)
        ALL fields must be present, even if empty/false
    """
    if board is None:
        try:
            board = chess.Board(fen)
        except Exception:
            # Return empty heuristics if FEN is invalid
            return _get_empty_heuristics()

    # Initialize result with all required fields
    result = _get_empty_heuristics()
    
    # ==========================================================================
    # POSITIONAL FACTS & CONCEPTS (Facts-First)
    # ==========================================================================
    result["position_facts"] = compute_position_facts(board, ply_count)

    # ==========================================================================
    # TENSION ANALYSIS (must be done first, as it informs hanging_piece)
    # ==========================================================================
    tension = _analyze_tension_targets(board)
    result["tension"] = tension
    
    # Compute concept scores now that we have tension and facts
    result["concept_scores"] = compute_concept_scores(result)
    
    # Derive convenience booleans from tension analysis
    result["trade_available"] = tension["has_trade_available"]
    result["threatened_piece"] = any(
        t["status"] in ("tension", "equal_trade") for t in tension["targets"]
    )
    result["winning_capture"] = tension["has_winning_capture"]
    result["losing_capture"] = any(
        t["status"] == "losing_capture" for t in tension["targets"]
    )
    
    # hanging_piece is now refined: only true if truly hanging or winning capture
    result["hanging_piece"] = tension["has_true_hanging_piece"] or tension["has_winning_capture"]

    # ==========================================================================
    # OTHER TACTICAL PATTERNS
    # ==========================================================================
    result["fork"] = _detect_fork(board)
    result["pin"] = _detect_pin(board)
    result["skewer"] = _detect_skewer(board)
    result["xray"] = _detect_xray(board)
    
    # Evidence-based trapped detection
    result["trapped_candidates"] = detect_trapped_candidates(board)
    result["trapped_piece"] = any(c["is_truly_trapped"] for c in result["trapped_candidates"])
    
    result["overloaded_piece"] = _detect_overloaded_pieces(board)
    result["discovered_attack"] = _detect_discovered_attack(board)

    # ==========================================================================
    # POSITIONAL FEATURES
    # ==========================================================================
    result["weak_squares"] = _detect_weak_squares(board)
    result["outposts"] = _detect_outposts(board)
    result["king_safety_drop"] = _detect_king_safety_drop(board)

    # ==========================================================================
    # PAWN STRUCTURE
    # ==========================================================================
    pawn_structure = _analyze_pawn_structure(board)
    result["pawn_structure"] = pawn_structure

    # ==========================================================================
    # MOBILITY
    # ==========================================================================
    result["mobility_score"] = _calculate_mobility(board)

    return result


def _get_empty_heuristics() -> Dict[str, Any]:
    """Return empty heuristics structure with all required fields."""
    return {
        # Original tactical patterns
        "fork": False,
        "pin": False,
        "skewer": False,
        "xray": False,
        "hanging_piece": False,
        "trapped_piece": False,
        "overloaded_piece": False,
        "discovered_attack": False,
        
        # Original positional features
        "weak_squares": [],
        "outposts": [],
        "king_safety_drop": False,
        "pawn_structure": {
            "isolated_pawns": [],
            "doubled_pawns": [],
            "passed_pawns": []
        },
        "mobility_score": {"white": 0, "black": 0, "delta": 0},
        
        # NEW: Tension analysis block
        "tension": {
            "targets": [],
            "has_trade_available": False,
            "has_winning_capture": False,
            "has_true_hanging_piece": False,
            "best_see_target": None,
        },
        
        # NEW: Convenience booleans derived from tension
        "trade_available": False,
        "threatened_piece": False,
        "winning_capture": False,
        "losing_capture": False,
        
        # NEW: Evidence-based trapped detection
        "trapped_candidates": [],
    }


def _detect_fork(board: chess.Board) -> bool:
    """Detect if any piece attacks two or more enemy pieces."""
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue
        
        attackers = board.attackers(piece.color, square)
        if len(attackers) >= 2:
            # Check if any attacker attacks multiple pieces
            for attacker_sq in attackers:
                attacks = board.attacks(attacker_sq)
                enemy_pieces_attacked = sum(
                    1 for sq in attacks
                    if board.piece_at(sq) and board.piece_at(sq).color != piece.color
                )
                if enemy_pieces_attacked >= 2:
                    return True
    return False


def _detect_pin(board: chess.Board) -> bool:
    """Detect if any piece is pinned to the king."""
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None or piece.piece_type == chess.KING:
            continue
        
        # Check if piece is between king and attacker
        king_square = board.king(piece.color)
        if king_square is None:
            continue
        
        # Get line between piece and king
        if chess.square_rank(square) == chess.square_rank(king_square):
            # Same rank
            start = min(square, king_square)
            end = max(square, king_square)
            for sq in range(start + 1, end):
                if board.piece_at(sq):
                    # Check if enemy piece attacks through
                    for attacker_sq in board.attackers(not piece.color, sq):
                        attacker = board.piece_at(attacker_sq)
                        if attacker and attacker.piece_type in [chess.ROOK, chess.QUEEN, chess.BISHOP]:
                            return True
        elif chess.square_file(square) == chess.square_file(king_square):
            # Same file
            start = min(square, king_square)
            end = max(square, king_square)
            for sq in range(start + 8, end, 8):
                if board.piece_at(sq):
                    for attacker_sq in board.attackers(not piece.color, sq):
                        attacker = board.piece_at(attacker_sq)
                        if attacker and attacker.piece_type in [chess.ROOK, chess.QUEEN, chess.BISHOP]:
                            return True
    
    return False


def _detect_skewer(board: chess.Board) -> bool:
    """Detect if a valuable piece is attacked through a less valuable piece."""
    # Simplified: check if queen/rook is attacked through pawn
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None or piece.piece_type == chess.KING:
            continue
        
        if piece.piece_type in [chess.QUEEN, chess.ROOK]:
            attackers = board.attackers(not piece.color, square)
            for attacker_sq in attackers:
                attacker = board.piece_at(attacker_sq)
                if attacker and attacker.piece_type in [chess.ROOK, chess.QUEEN, chess.BISHOP]:
                    # Check if there's a less valuable piece behind
                    # This is simplified - full implementation would check line of attack
                    return True
    return False


def _detect_xray(board: chess.Board) -> bool:
    """Detect if a piece attacks through another piece."""
    # Simplified: check if piece attacks square through friendly piece
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue
        
        attacks = board.attacks(square)
        for attacked_sq in attacks:
            if board.piece_at(attacked_sq) and board.piece_at(attacked_sq).color == piece.color:
                # Check if removing friendly piece reveals attack
                temp_board = board.copy()
                temp_board.remove_piece_at(attacked_sq)
                if square in temp_board.attackers(piece.color, attacked_sq):
                    return True
    return False


def _detect_hanging_pieces(board: chess.Board) -> bool:
    """Detect if any piece is attacked but not defended."""
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None or piece.piece_type == chess.KING:
            continue
        
        attackers = board.attackers(not piece.color, square)
        defenders = board.attackers(piece.color, square)
        
        if len(attackers) > 0 and len(defenders) == 0:
            return True
    return False


def detect_trapped_candidates(board: chess.Board) -> List[Dict[str, Any]]:
    """
    Detect pieces that might be trapped with full evidence.
    
    IMPORTANT: Only evaluates pieces of the SIDE-TO-MOVE (board.turn).
    This is correct because:
    1. board.legal_moves only contains moves for side-to-move
    2. A piece can only be "trapped" if it's your turn and you can't save it
    3. Evaluating opponent pieces would give false results
    
    Additional constraints to avoid false positives:
    - Skip when side-to-move is in check (pieces can't move due to check rules, not trapping)
    - Consider exchange value (piece isn't trapped if opponent capturing it is an equal/losing trade)
    
    Returns a list of candidates with:
    - square: str (e.g., "b5")
    - piece: str (e.g., "B" for bishop)
    - color: str ("white" or "black")
    - is_attacked: bool
    - legal_escape_moves_san: list of SAN strings (all legal moves from that square)
    - safe_escape_moves_san: list of SAN strings (moves that don't lose material)
    - num_escape_moves: int
    - num_safe_moves: int
    - is_truly_trapped: bool (True only if attacked AND zero safe escapes AND opponent wins material)
    
    This provides evidence so narrator never claims "trapped" without proof.
    """
    PIECE_SYMBOLS = {
        chess.PAWN: "P", chess.KNIGHT: "N", chess.BISHOP: "B",
        chess.ROOK: "R", chess.QUEEN: "Q", chess.KING: "K"
    }
    
    # Piece values for exchange evaluation
    PIECE_VALUES = {
        chess.PAWN: 100, chess.KNIGHT: 300, chess.BISHOP: 320,
        chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0
    }
    
    candidates = []
    side_to_move = board.turn
    
    # CRITICAL FIX #1: Skip evaluation when in check
    # When in check, pieces have no legal moves not because they're "trapped"
    # but because all legal moves must address the check. This was causing
    # false positives like "trapped bishop" when the king is in check.
    if board.is_check():
        return candidates
    
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None or piece.piece_type == chess.KING:
            continue
        
        # Skip pawns - "trapped" typically refers to pieces that should be able
        # to move but can't. Pawns are frequently attacked and can't retreat,
        # so calling them "trapped" produces noisy, unhelpful commentary.
        if piece.piece_type == chess.PAWN:
            continue
        
        # CRITICAL FIX: Only evaluate pieces of the side-to-move
        # board.legal_moves only contains moves for board.turn, so evaluating
        # opponent pieces would give incorrect results (they'd appear to have
        # no legal moves when in fact it's just not their turn)
        if piece.color != side_to_move:
            continue
        
        # Skip PINNED pieces - a pinned piece is restricted because moving it
        # would expose the king to check, which is a DIFFERENT tactical concept
        # than being "trapped" (having nowhere to go). Users expect "trapped"
        # to mean the piece has no squares, not that it's defending the king.
        is_pinned = board.is_pinned(piece.color, square)
        if is_pinned:
            continue
        
        # Check if piece is attacked by opponent
        attackers = board.attackers(not piece.color, square)
        is_attacked = bool(attackers)
        
        # If not attacked, it's not "trapped" in the tactical sense
        # (may be restricted, but can't be lost immediately)
        if not is_attacked:
            continue
        
        # CRITICAL FIX #2: Check if capturing this piece wins material for opponent
        # A piece is NOT truly trapped if:
        # - It's part of an equal exchange (e.g., knight takes bishop, queen recaptures)
        # - The opponent would lose material by capturing it
        # This is the key difference between "trapped" and "tension/exchange"
        
        # Check if piece is defended (opponent capturing leads to recapture)
        defenders = board.attackers(piece.color, square)
        
        # If piece is defended and the exchange is equal or losing for opponent, 
        # it's NOT trapped - it's just tension/exchange
        if defenders:
            # Find the lowest-value attacker
            lowest_attacker_value = float('inf')
            for attacker_sq in attackers:
                attacker_piece = board.piece_at(attacker_sq)
                if attacker_piece:
                    attacker_value = PIECE_VALUES.get(attacker_piece.piece_type, 0)
                    lowest_attacker_value = min(lowest_attacker_value, attacker_value)
            
            # Value of the piece being "trapped"
            piece_value = PIECE_VALUES.get(piece.piece_type, 0)
            
            # Find the lowest-value defender (for recapture)
            lowest_defender_value = float('inf')
            for defender_sq in defenders:
                defender_piece = board.piece_at(defender_sq)
                if defender_piece:
                    defender_value = PIECE_VALUES.get(defender_piece.piece_type, 0)
                    lowest_defender_value = min(lowest_defender_value, defender_value)
            
            # Calculate exchange outcome:
            # If opponent captures: they gain piece_value, lose lowest_attacker_value
            # After recapture: we gain lowest_attacker_value
            # Net for opponent: piece_value - lowest_attacker_value
            # But if we can recapture, opponent loses their attacker too
            
            # Simple exchange heuristic: if lowest attacker >= piece value, 
            # opponent doesn't gain material, so it's not a trapped piece - just tension
            if lowest_attacker_value >= piece_value - 50:  # 50cp tolerance for bishop pair etc.
                continue  # Not trapped, just an exchange opportunity
        
        # Find all legal moves for this piece and check their safety
        legal_moves = []
        safe_moves = []
        
        for move in board.legal_moves:
            if move.from_square == square:
                move_san = board.san(move)
                legal_moves.append(move_san)
                
                # Check safety of this move
                # 1. Play on temp board
                temp_board = board.copy()
                temp_board.push(move)
                
                # 2. Check if moved piece is attacked on destination
                dest_sq = move.to_square
                is_still_attacked = temp_board.is_attacked_by(not piece.color, dest_sq)
                
                if is_still_attacked:
                    # 3. Compute SEE for opponent capture
                    # If opponent gains significant material (>= 80cp), it's unsafe
                    opponent_see = _compute_see(temp_board, dest_sq)
                    
                    if opponent_see >= 80:
                        # Unsafe escape - opponent wins material
                        continue
                
                # If not attacked on destination OR SEE shows opponent doesn't 
                # win material, it's a safe escape
                safe_moves.append(move_san)
        
        num_legal = len(legal_moves)
        num_safe = len(safe_moves)
        
        # Truly trapped: attacked AND (no legal moves OR all moves are unsafe)
        is_truly_trapped = is_attacked and (num_legal == 0 or num_safe == 0)
        
        # Only return truly trapped pieces (to avoid noise)
        if is_truly_trapped:
            candidates.append({
                "square": chess.square_name(square),
                "piece": PIECE_SYMBOLS.get(piece.piece_type, "?"),
                "color": "white" if piece.color == chess.WHITE else "black",
                "is_attacked": is_attacked,
                "legal_escape_moves_san": legal_moves,
                "safe_escape_moves_san": safe_moves,
                "num_escape_moves": num_legal,
                "num_safe_moves": num_safe,
                "is_truly_trapped": True,
            })
    
    return candidates




def _detect_trapped_pieces(board: chess.Board) -> bool:
    """
    Detect if any piece is truly trapped (no escape moves AND is attacked).
    
    Uses the evidence-based detect_trapped_candidates() internally.
    Only returns True if we have proof.
    """
    candidates = detect_trapped_candidates(board)
    return any(c["is_truly_trapped"] for c in candidates)


def _detect_overloaded_pieces(board: chess.Board) -> bool:
    """Detect if any piece defends multiple pieces or squares."""
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue
        
        # Count pieces defended by this piece
        defended_count = 0
        for defended_sq in chess.SQUARES:
            if defended_sq == square:
                continue
            defended_piece = board.piece_at(defended_sq)
            if defended_piece and defended_piece.color == piece.color:
                if square in board.attackers(piece.color, defended_sq):
                    defended_count += 1
        
        if defended_count >= 2:
            return True
    return False


def _detect_discovered_attack(board: chess.Board) -> bool:
    """Detect if moving a piece reveals an attack."""
    # Check if any move creates a new attack
    for move in board.legal_moves:
        temp_board = board.copy()
        temp_board.push(move)
        
        # Check if this move revealed an attack
        from_sq = move.from_square
        to_sq = move.to_square
        
        # Check if piece behind from_sq now attacks something
        for sq in chess.SQUARES:
            if sq == from_sq or sq == to_sq:
                continue
            piece = temp_board.piece_at(sq)
            if piece and piece.color == board.turn:
                attacks_after = temp_board.attacks(sq)
                attacks_before = board.attacks(sq)
                if len(attacks_after) > len(attacks_before):
                    return True
    return False


def _detect_weak_squares(board: chess.Board) -> List[str]:
    """Detect weak squares (attacked more times than defended)."""
    weak_squares = []
    for square in chess.SQUARES:
        attackers = len(board.attackers(not board.turn, square))
        defenders = len(board.attackers(board.turn, square))
        
        if attackers > defenders and board.piece_at(square) is None:
            weak_squares.append(chess.square_name(square))
    
    return weak_squares


def _detect_outposts(board: chess.Board) -> List[str]:
    """Detect strong outpost squares."""
    outposts = []
    for square in chess.SQUARES:
        # Outpost: square supported by pawn, not attackable by enemy pawns
        if board.piece_at(square) is None:
            rank = chess.square_rank(square)
            file = chess.square_file(square)
            
            # Check if supported by friendly pawn
            supported = False
            if board.turn == chess.WHITE and rank > 0:
                # Check pawns on rank below
                for f in [file - 1, file + 1]:
                    if 0 <= f < 8:
                        pawn_sq = chess.square(f, rank - 1)
                        pawn = board.piece_at(pawn_sq)
                        if pawn and pawn.piece_type == chess.PAWN and pawn.color == chess.WHITE:
                            supported = True
                            break
            
            if supported:
                # Check if not attackable by enemy pawns
                enemy_attackers = board.attackers(not board.turn, square)
                enemy_pawn_attackers = [
                    sq for sq in enemy_attackers
                    if board.piece_at(sq) and board.piece_at(sq).piece_type == chess.PAWN
                ]
                if len(enemy_pawn_attackers) == 0:
                    outposts.append(chess.square_name(square))
    
    return outposts


def _detect_king_safety_drop(board: chess.Board) -> bool:
    """Detect if king safety has significantly decreased."""
    # Simplified: check if king is exposed (fewer pawns around)
    king_square = board.king(board.turn)
    if king_square is None:
        return False
    
    # Count pawns around king
    king_rank = chess.square_rank(king_square)
    king_file = chess.square_file(king_square)
    pawn_count = 0
    
    for rank_offset in [-1, 0, 1]:
        for file_offset in [-1, 0, 1]:
            if rank_offset == 0 and file_offset == 0:
                continue
            r = king_rank + rank_offset
            f = king_file + file_offset
            if 0 <= r < 8 and 0 <= f < 8:
                sq = chess.square(f, r)
                piece = board.piece_at(sq)
                if piece and piece.piece_type == chess.PAWN and piece.color == board.turn:
                    pawn_count += 1
    
    # Consider king unsafe if fewer than 2 pawns nearby
    return pawn_count < 2


def _analyze_pawn_structure(board: chess.Board) -> Dict[str, List[str]]:
    """Analyze pawn structure for isolated, doubled, and passed pawns."""
    isolated = []
    doubled = []
    passed = []
    
    # Group pawns by file
    pawns_by_file = {f: [] for f in range(8)}
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece and piece.piece_type == chess.PAWN:
            file = chess.square_file(square)
            pawns_by_file[file].append(square)
    
    # Find isolated pawns (no friendly pawns on adjacent files)
    for file in range(8):
        for pawn_sq in pawns_by_file[file]:
            piece = board.piece_at(pawn_sq)
            if piece is None:
                continue
            
            has_adjacent = False
            for adj_file in [file - 1, file + 1]:
                if 0 <= adj_file < 8 and len(pawns_by_file[adj_file]) > 0:
                    # Check if adjacent file has same color pawn
                    for adj_sq in pawns_by_file[adj_file]:
                        adj_piece = board.piece_at(adj_sq)
                        if adj_piece and adj_piece.color == piece.color:
                            has_adjacent = True
                            break
                    if has_adjacent:
                        break
            
            if not has_adjacent:
                isolated.append(chess.square_name(pawn_sq))
    
    # Find doubled pawns (multiple pawns on same file)
    for file in range(8):
        if len(pawns_by_file[file]) > 1:
            # Check if same color
            colors = set()
            for pawn_sq in pawns_by_file[file]:
                piece = board.piece_at(pawn_sq)
                if piece:
                    colors.add(piece.color)
            
            if len(colors) == 1:  # All same color
                for pawn_sq in pawns_by_file[file]:
                    doubled.append(chess.square_name(pawn_sq))
    
    # Find passed pawns (no enemy pawns in front or on adjacent files)
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece and piece.piece_type == chess.PAWN:
            rank = chess.square_rank(square)
            file = chess.square_file(square)
            is_passed = True
            
            # Check forward ranks
            direction = 1 if piece.color == chess.WHITE else -1
            for r in range(rank + direction, 8 if direction > 0 else -1, direction):
                # Check same file and adjacent files
                for f in [file - 1, file, file + 1]:
                    if 0 <= f < 8:
                        check_sq = chess.square(f, r)
                        check_piece = board.piece_at(check_sq)
                        if check_piece and check_piece.piece_type == chess.PAWN and check_piece.color != piece.color:
                            is_passed = False
                            break
                if not is_passed:
                    break
            
            if is_passed:
                passed.append(chess.square_name(square))
    
    return {
        "isolated_pawns": isolated,
        "doubled_pawns": doubled,
        "passed_pawns": passed
    }


def _calculate_mobility(board: chess.Board) -> Dict[str, int]:
    """
    Calculate mobility score for BOTH colors (not just side-to-move).
    
    This prevents the evaluation from flipping sign each ply and
    provides symmetric scoring.
    
    Returns:
        {"white": int, "black": int, "delta": int}
    """
    # Calculate white's mobility
    white_board = board.copy()
    white_board.turn = chess.WHITE
    white_mobility = len(list(white_board.pseudo_legal_moves))
    
    # Calculate black's mobility  
    black_board = board.copy()
    black_board.turn = chess.BLACK
    black_mobility = len(list(black_board.pseudo_legal_moves))
    
    return {
        "white": white_mobility,
        "black": black_mobility,
        "delta": white_mobility - black_mobility  # Positive = white has more moves
    }

def compute_move_facts(fen_before: str, fen_after: str, move_from: str, move_to: str, move_san: str) -> dict:
    """
    Compute factual information about a chess move that can be narrated by the LLM.
    This prevents LLM from hallucinating chess consequences.
    """
    import chess

    try:
        board_before = chess.Board(fen_before)
        board_after = chess.Board(fen_after)

        from_square = chess.parse_square(move_from)
        to_square = chess.parse_square(move_to)

        # Get the piece that moved
        piece = board_after.piece_at(to_square)
        if not piece:
            return {"error": "No piece found at destination"}

        piece_names = {
            chess.PAWN: "pawn",
            chess.KNIGHT: "knight",
            chess.BISHOP: "bishop",
            chess.ROOK: "rook",
            chess.QUEEN: "queen",
            chess.KING: "king"
        }
        piece_type = piece_names.get(piece.piece_type, "piece")
        piece_color = "White" if piece.color == chess.WHITE else "Black"

        facts = {
            "piece_type": piece_type,
            "piece_color": piece_color,
            "from_square": move_from,
            "to_square": move_to,
            "move_san": move_san,
        }

        # Squares controlled by the moved piece in new position
        controlled_squares = []
        for square in chess.SQUARES:
            if board_after.is_attacked_by(piece.color, square):
                # Check if this specific piece attacks this square
                attackers = board_after.attackers(piece.color, square)
                if to_square in attackers:
                    controlled_squares.append(chess.square_name(square))
        facts["squares_controlled"] = sorted(controlled_squares)

        # Pieces NEWLY defended by the moved piece that are UNDER ATTACK
        defended_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color == piece.color and square != to_square:
                attackers_after = board_after.attackers(piece.color, square)
                if to_square in attackers_after:
                    attackers_before = board_before.attackers(piece.color, square)
                    was_defended_by_this_piece = from_square in attackers_before

                    if not was_defended_by_this_piece:
                        is_under_attack = board_after.is_attacked_by(not piece.color, square)
                        if is_under_attack:
                            sq_name = chess.square_name(square)
                            defended_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
        facts["pieces_defended"] = defended_pieces

        # Pieces NEWLY attacked by the moved piece
        attacked_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color != piece.color:
                attackers_after = board_after.attackers(piece.color, square)
                if to_square in attackers_after:
                    attackers_before = board_before.attackers(piece.color, square)
                    was_attacked_by_this_piece = from_square in attackers_before

                    if not was_attacked_by_this_piece:
                        attacked_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {chess.square_name(square)}")
        facts["pieces_attacked"] = attacked_pieces

        # Hanging pieces
        hanging_pieces = []
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if target_piece and target_piece.color == piece.color:
                if target_piece.piece_type == chess.KING:
                    continue
                opponent_attackers = board_after.attackers(not piece.color, square)
                if opponent_attackers:
                    defenders = board_after.attackers(piece.color, square)
                    num_attackers = len(opponent_attackers)
                    num_defenders = len(defenders)

                    if num_attackers > num_defenders:
                        sq_name = chess.square_name(square)
                        hanging_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
                    elif num_attackers == num_defenders and num_attackers > 0:
                        piece_values = {
                            chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                            chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0
                        }
                        target_value = piece_values.get(target_piece.piece_type, 0)
                        min_attacker_value = 10
                        for attacker_sq in opponent_attackers:
                            attacker = board_after.piece_at(attacker_sq)
                            if attacker:
                                min_attacker_value = min(min_attacker_value, piece_values.get(attacker.piece_type, 0))
                        if min_attacker_value < target_value:
                            sq_name = chess.square_name(square)
                            hanging_pieces.append(f"{piece_names.get(target_piece.piece_type, 'piece')} on {sq_name}")
        facts["hanging_pieces"] = hanging_pieces

        # Lines opened
        lines_opened = []
        if piece.piece_type == chess.PAWN:
            for bishop_square in board_after.pieces(chess.BISHOP, piece.color):
                attacks_before = len(list(board_before.attacks(bishop_square)))
                attacks_after = len(list(board_after.attacks(bishop_square)))
                if attacks_after > attacks_before:
                    is_light = (chess.square_file(bishop_square) + chess.square_rank(bishop_square)) % 2 == 1
                    lines_opened.append(f"{'light' if is_light else 'dark'}-squared bishop on {chess.square_name(bishop_square)}")
            for rook_square in board_after.pieces(chess.ROOK, piece.color):
                if len(list(board_after.attacks(rook_square))) > len(list(board_before.attacks(rook_square))):
                    lines_opened.append(f"rook on {chess.square_name(rook_square)}")
            for queen_square in board_after.pieces(chess.QUEEN, piece.color):
                if len(list(board_after.attacks(queen_square))) > len(list(board_before.attacks(queen_square))):
                    lines_opened.append(f"queen on {chess.square_name(queen_square)}")
        facts["lines_opened"] = lines_opened

        # Rooks connected
        rooks = list(board_after.pieces(chess.ROOK, piece.color))
        rooks_connected = False
        if len(rooks) == 2:
            r1, r2 = rooks
            if chess.square_rank(r1) == chess.square_rank(r2):
                min_f, max_f = min(chess.square_file(r1), chess.square_file(r2)), max(chess.square_file(r1), chess.square_file(r2))
                rooks_connected = not any(board_after.piece_at(chess.square(f, chess.square_rank(r1))) for f in range(min_f + 1, max_f))
            elif chess.square_file(r1) == chess.square_file(r2):
                min_r, max_r = min(chess.square_rank(r1), chess.square_rank(r2)), max(chess.square_rank(r1), chess.square_rank(r2))
                rooks_connected = not any(board_after.piece_at(chess.square(chess.square_file(r1), r)) for r in range(min_r + 1, max_r))
        facts["rooks_connected"] = rooks_connected

        # Special properties
        facts["is_check"] = board_after.is_check()
        facts["is_capture"] = board_before.piece_at(to_square) is not None
        try:
            facts["is_castling"] = board_before.is_castling(chess.Move(from_square, to_square))
        except:
            facts["is_castling"] = False
        
        captured = board_before.piece_at(to_square)
        facts["captured_piece"] = piece_names.get(captured.piece_type) if captured else None

        return facts
    except Exception as e:
        return {"error": str(e)}
