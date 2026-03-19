"""
Highlight extraction service for identifying noteworthy moments in analyzed games.

Uses existing move classification data from engine analysis to detect:
- Brilliant moves
- Comeback wins
- Epic saves (defensive brilliance)
- Perfect opening execution
- Tactical sequences
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict


# Tactical motifs that qualify a move as potentially "brilliant"
TACTICAL_MOTIFS = [
    "fork", "pin", "skewer", "xray", "discovered_attack",
    "hanging_piece", "trapped_piece", "overloaded_piece"
]


def extract_highlights(
    engine_moves: List[Dict[str, Any]],
    report: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Extract highlight-worthy moments from existing move analysis.

    Args:
        engine_moves: List of move analysis objects from the pipeline
        report: Full report object (to access openings, puzzles, weak lines)

    Returns:
        List of highlight objects ready for display
    """
    if not engine_moves:
        return []

    highlights = []

    # Extract data from report
    generated_puzzles = report.get("generated_puzzles", []) or []
    puzzle_eco_map = _build_puzzle_eco_map(generated_puzzles)

    # Detect each highlight type
    highlights.extend(_detect_brilliant_moves(engine_moves, puzzle_eco_map))
    highlights.extend(_detect_comeback_wins(engine_moves, report, puzzle_eco_map))
    highlights.extend(_detect_epic_saves(engine_moves, puzzle_eco_map))
    highlights.extend(_detect_perfect_openings(engine_moves, puzzle_eco_map))
    highlights.extend(_detect_tactical_sequences(engine_moves, puzzle_eco_map))

    return highlights


def _build_puzzle_eco_map(puzzles: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Build a map of ECO codes to puzzle IDs for quick lookup."""
    eco_map: Dict[str, List[str]] = defaultdict(list)
    for puzzle in puzzles:
        eco = puzzle.get("eco")
        puzzle_id = puzzle.get("puzzle_id")
        if eco and puzzle_id:
            eco_map[eco].append(puzzle_id)
    return eco_map


def _get_motifs_from_heuristics(heuristics: Dict[str, Any]) -> List[str]:
    """Extract triggered tactical motifs from heuristics dict."""
    if not heuristics:
        return []
    
    motifs = []
    for motif in TACTICAL_MOTIFS:
        if heuristics.get(motif) is True:
            motifs.append(motif)
    return motifs


def _detect_brilliant_moves(
    moves: List[Dict[str, Any]],
    puzzle_eco_map: Dict[str, List[str]]
) -> List[Dict[str, Any]]:
    """
    Detect BRILLIANT MOVE highlights.

    Conditions:
    - User played the engine best move (move matches best_move)
    - Heuristics contain a tactical motif
    - cp_gain >= 150 cp (1.5 pawns)
    """
    highlights = []

    for move in moves:
        # Check if move equals engine's best
        played_move = move.get("move", "")
        best_move = move.get("best_move", "")
        
        if not played_move or played_move != best_move:
            continue

        # Check for tactical motif
        heuristics = move.get("heuristics", {})
        motifs = _get_motifs_from_heuristics(heuristics)
        
        if not motifs:
            continue

        # Check cp gain (eval_delta >= 150)
        eval_delta = move.get("eval_delta", 0)
        if eval_delta < 150:
            continue

        # This is a brilliant move!
        eco = move.get("eco")
        related_puzzles = puzzle_eco_map.get(eco, []) if eco else []
        cp_pawns = round(eval_delta / 100, 1)
        
        motif_text = motifs[0].replace("_", " ")
        desc = (
            f"You found the engine's top move in a tactical position, "
            f"gaining +{cp_pawns} pawns. This is a true brilliancy featuring "
            f"a {motif_text} on move {(move.get('ply', 1) + 1) // 2}."
        )

        highlights.append({
            "type": "brilliant",
            "game_id": str(move.get("game_id", "")),
            "ply": move.get("ply", 0),
            "eco": eco,
            "cp_change": cp_pawns,
            "description": desc,
            "motifs": motifs,
            "related_puzzles": related_puzzles,
            "fen_before": move.get("fen_before"),
            "move": played_move
        })

    return highlights


def _detect_comeback_wins(
    moves: List[Dict[str, Any]],
    report: Dict[str, Any],
    puzzle_eco_map: Dict[str, List[str]]
) -> List[Dict[str, Any]]:
    """
    Detect COMEBACK WIN highlights.

    Conditions:
    - Game had min eval <= -200 cp (user was losing)
    - Final result is a win for the user
    - Identify turnaround move (largest positive cp_gain)
    """
    highlights = []

    # Group moves by game
    games: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for move in moves:
        game_id = str(move.get("game_id", ""))
        if game_id:
            games[game_id].append(move)

    # Analyze each game
    for game_id, game_moves in games.items():
        if not game_moves:
            continue

        # Calculate min eval and check for losing position
        evals = []
        for m in game_moves:
            ev = m.get("eval", {})
            cp = ev.get("cp", 0) if isinstance(ev, dict) else 0
            evals.append(cp)

        if not evals:
            continue

        min_eval = min(evals)
        
        # Must have been losing (-200 cp or worse)
        if min_eval > -200:
            continue

        # Check if final eval is winning (simplified - check last move eval)
        final_eval = evals[-1] if evals else 0
        if final_eval < 100:  # Not clearly winning at end
            continue

        # Find turnaround move (largest positive eval_delta)
        turnaround_move = None
        max_gain = 0
        
        for m in game_moves:
            delta = m.get("eval_delta", 0)
            if delta > max_gain:
                max_gain = delta
                turnaround_move = m

        if not turnaround_move or max_gain < 100:
            continue

        eco = turnaround_move.get("eco")
        related_puzzles = puzzle_eco_map.get(eco, []) if eco else []
        move_num = (turnaround_move.get("ply", 1) + 1) // 2
        min_pawns = round(min_eval / 100, 1)
        gain_pawns = round(max_gain / 100, 1)

        desc = (
            f"Despite being {min_pawns} pawns down, you turned the game around "
            f"with {turnaround_move.get('move', '?')} on move {move_num}, "
            f"gaining +{gain_pawns} and leading to a winning advantage."
        )

        highlights.append({
            "type": "comeback",
            "game_id": game_id,
            "ply": turnaround_move.get("ply", 0),
            "eco": eco,
            "cp_change": gain_pawns,
            "description": desc,
            "motifs": _get_motifs_from_heuristics(turnaround_move.get("heuristics", {})),
            "related_puzzles": related_puzzles,
            "fen_before": turnaround_move.get("fen_before"),
            "move": turnaround_move.get("move")
        })

    return highlights


def _detect_epic_saves(
    moves: List[Dict[str, Any]],
    puzzle_eco_map: Dict[str, List[str]]
) -> List[Dict[str, Any]]:
    """
    Detect EPIC SAVE (defensive brilliance) highlights.

    Conditions:
    - eval_before <= -300 cp (very bad position)
    - eval_after moves toward equality (> -80 cp)
    - Move is best move OR defensive motif triggered
    """
    highlights = []

    for move in moves:
        # Get eval before the move
        eval_data = move.get("eval", {})
        eval_after = eval_data.get("cp", 0) if isinstance(eval_data, dict) else 0
        eval_delta = move.get("eval_delta", 0)
        eval_before = eval_after - eval_delta

        # Must have been in severe disadvantage
        if eval_before > -300:
            continue

        # Position must have improved toward equality
        if eval_after <= -80:
            continue

        # Verify it's a good move (best move or significant recovery)
        played_move = move.get("move", "")
        best_move = move.get("best_move", "")
        is_best = played_move == best_move if played_move and best_move else False
        
        recovery = eval_after - eval_before
        if not is_best and recovery < 200:
            continue

        eco = move.get("eco")
        related_puzzles = puzzle_eco_map.get(eco, []) if eco else []
        move_num = (move.get("ply", 1) + 1) // 2
        before_pawns = round(eval_before / 100, 1)
        after_pawns = round(eval_after / 100, 1)

        desc = (
            f"Your defensive move {played_move} on move {move_num} neutralized "
            f"a {before_pawns} pawn attack and brought the game back to "
            f"{'+' if after_pawns >= 0 else ''}{after_pawns}."
        )

        highlights.append({
            "type": "save",
            "game_id": str(move.get("game_id", "")),
            "ply": move.get("ply", 0),
            "eco": eco,
            "cp_change": round(recovery / 100, 1),
            "description": desc,
            "motifs": _get_motifs_from_heuristics(move.get("heuristics", {})),
            "related_puzzles": related_puzzles,
            "fen_before": move.get("fen_before"),
            "move": played_move
        })

    return highlights


def _detect_perfect_openings(
    moves: List[Dict[str, Any]],
    puzzle_eco_map: Dict[str, List[str]]
) -> List[Dict[str, Any]]:
    """
    Detect PERFECT OPENING EXECUTION highlights.

    Conditions:
    - For plies <= 10 (opening phase)
    - 80%+ of moves are best moves
    - Eval stays between -30 and +30 cp
    """
    highlights = []

    # Group moves by game
    games: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for move in moves:
        game_id = str(move.get("game_id", ""))
        if game_id:
            games[game_id].append(move)

    for game_id, game_moves in games.items():
        # Filter to opening phase (ply <= 10)
        opening_moves = [m for m in game_moves if m.get("ply", 99) <= 10]
        
        if len(opening_moves) < 3:  # Need at least 3 moves to evaluate
            continue

        # Count best moves
        best_count = 0
        eval_in_range = True
        
        for m in opening_moves:
            played = m.get("move", "")
            best = m.get("best_move", "")
            if played and played == best:
                best_count += 1
            
            # Check eval range
            eval_data = m.get("eval", {})
            cp = eval_data.get("cp", 0) if isinstance(eval_data, dict) else 0
            if abs(cp) > 30:
                eval_in_range = False

        # Check 80% threshold
        best_percentage = best_count / len(opening_moves)
        if best_percentage < 0.8 or not eval_in_range:
            continue

        # Get ECO from first opening move with eco data
        eco = None
        for m in opening_moves:
            eco = m.get("eco")
            if eco:
                break

        related_puzzles = puzzle_eco_map.get(eco, []) if eco else []
        
        desc = (
            f"You played a flawless opening in {eco or 'this game'}, "
            f"maintaining an equal or better eval through the first "
            f"{len(opening_moves)} moves with {int(best_percentage * 100)}% accuracy."
        )

        highlights.append({
            "type": "perfect_opening",
            "game_id": game_id,
            "ply": max(m.get("ply", 0) for m in opening_moves),
            "eco": eco,
            "cp_change": 0,
            "description": desc,
            "motifs": [],
            "related_puzzles": related_puzzles,
            "fen_before": opening_moves[0].get("fen_before") if opening_moves else None,
            "move": None
        })

    return highlights


def _detect_tactical_sequences(
    moves: List[Dict[str, Any]],
    puzzle_eco_map: Dict[str, List[str]]
) -> List[Dict[str, Any]]:
    """
    Detect TACTICAL SEQUENCE highlights.

    Conditions:
    - 3+ consecutive moves where move == best_move
    - Cumulative cp_gain >= 100
    """
    highlights = []

    # Group moves by game
    games: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for move in moves:
        game_id = str(move.get("game_id", ""))
        if game_id:
            games[game_id].append(move)

    for game_id, game_moves in games.items():
        # Sort by ply
        sorted_moves = sorted(game_moves, key=lambda m: m.get("ply", 0))
        
        # Find sequences
        sequence_start = None
        sequence_moves: List[Dict[str, Any]] = []
        cumulative_gain = 0

        for i, m in enumerate(sorted_moves):
            played = m.get("move", "")
            best = m.get("best_move", "")
            is_best = played and played == best
            delta = m.get("eval_delta", 0)
            
            if is_best and delta > 0:
                if sequence_start is None:
                    sequence_start = i
                sequence_moves.append(m)
                cumulative_gain += delta
            else:
                # Check if we have a valid sequence
                if len(sequence_moves) >= 3 and cumulative_gain >= 100:
                    _add_tactical_sequence(
                        highlights, game_id, sequence_moves, 
                        cumulative_gain, puzzle_eco_map
                    )
                # Reset
                sequence_start = None
                sequence_moves = []
                cumulative_gain = 0

        # Check final sequence
        if len(sequence_moves) >= 3 and cumulative_gain >= 100:
            _add_tactical_sequence(
                highlights, game_id, sequence_moves,
                cumulative_gain, puzzle_eco_map
            )

    return highlights


def _add_tactical_sequence(
    highlights: List[Dict[str, Any]],
    game_id: str,
    sequence_moves: List[Dict[str, Any]],
    cumulative_gain: int,
    puzzle_eco_map: Dict[str, List[str]]
) -> None:
    """Helper to add a tactical sequence highlight."""
    first_move = sequence_moves[0]
    eco = first_move.get("eco")
    related_puzzles = puzzle_eco_map.get(eco, []) if eco else []
    
    # Collect all motifs from the sequence
    all_motifs = []
    for m in sequence_moves:
        all_motifs.extend(_get_motifs_from_heuristics(m.get("heuristics", {})))
    unique_motifs = list(set(all_motifs))
    
    motif_text = ""
    if unique_motifs:
        motif_text = f" featuring {unique_motifs[0].replace('_', ' ')}"
        if len(unique_motifs) > 1:
            motif_text += f" and {unique_motifs[1].replace('_', ' ')}"

    gain_pawns = round(cumulative_gain / 100, 1)
    
    desc = (
        f"You executed a {len(sequence_moves)}-move tactical sequence{motif_text} "
        f"and forced a +{gain_pawns} pawn advantage."
    )

    highlights.append({
        "type": "tactical_sequence",
        "game_id": game_id,
        "ply": first_move.get("ply", 0),
        "eco": eco,
        "cp_change": gain_pawns,
        "description": desc,
        "motifs": unique_motifs,
        "related_puzzles": related_puzzles,
        "fen_before": first_move.get("fen_before"),
        "move": first_move.get("move")
    })
