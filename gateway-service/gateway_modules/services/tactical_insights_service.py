"""
Tactical insights generation service for repertoire reports.

Redesigned to produce two focused insight systems:
1. Mistake Motifs — motifs where the USER made the mistake
2. Defensive Motifs — motifs where the OPPONENT successfully executed tactics against the user
"""

from typing import Dict, List, Any, Optional
from collections import defaultdict
from ..models.repertoire import (
    RepertoireInsight,
    MistakeMotifEntry,
    DefensiveMotifEntry,
    PhaseDistribution
)


# Tactical pattern names we track
TACTICAL_PATTERNS = [
    "fork", "pin", "skewer", "xray", "hanging_piece",
    "trapped_piece", "overloaded_piece", "discovered_attack"
]


def get_game_phase(ply: int) -> str:
    """
    Determine game phase based on ply number.
    - Opening: ply 1-20 (moves 1-10)
    - Middlegame: ply 21-60 (moves 11-30)
    - Endgame: ply 61+ (moves 31+)
    """
    if ply <= 20:
        return "opening"
    elif ply <= 60:
        return "middlegame"
    else:
        return "endgame"


def compute_mistake_motifs(
    move_analyses_by_game: Dict[str, List[Dict[str, Any]]],
    game_eco_map: Dict[str, str],
    cp_loss_threshold: int = -50  # 0.5 pawn
) -> List[MistakeMotifEntry]:
    """
    Compute tactical motifs where the USER made a mistake.
    
    Classification rule:
    - User's move (already filtered in pipeline)
    - mistake_type ∈ {"inaccuracy", "mistake", "blunder"}
    - eval_delta < cp_loss_threshold (significant tactical loss)
    - At least one tactical heuristic flag is true
    
    Args:
        move_analyses_by_game: {game_id: [move_analysis, ...]}
        game_eco_map: {game_id: eco_code}
        cp_loss_threshold: Minimum CP loss to consider (default -50 = -0.5 pawn)
    
    Returns:
        List of MistakeMotifEntry sorted by impact (count * avg_cp_loss)
    """
    # Aggregate data per motif
    motif_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "cp_losses": [],
        "plys": [],
        "openings": [],
        "phases": {"opening": 0, "middlegame": 0, "endgame": 0},
        "examples": []
    })
    
    for game_id, moves in move_analyses_by_game.items():
        eco = game_eco_map.get(game_id, "")
        
        for move in moves:
            # Only count BLUNDERS - the heuristics detect positional features
            # (not move-specific tactical causes), so we filter to significant errors
            mistake_type = move.get("mistake_type")
            if mistake_type != "blunder":
                continue
            
            # Check for significant loss
            eval_delta = move.get("eval_delta", 0)
            if eval_delta >= cp_loss_threshold:
                continue
            
            # Check for tactical patterns
            heuristics = move.get("heuristics", {})
            for pattern in TACTICAL_PATTERNS:
                if heuristics.get(pattern, False):
                    data = motif_data[pattern]
                    data["cp_losses"].append(eval_delta)
                    
                    ply = move.get("ply", 0)
                    data["plys"].append(ply)
                    
                    if eco:
                        data["openings"].append(eco)
                    
                    phase = get_game_phase(ply)
                    data["phases"][phase] += 1
                    
                    # Store example (limit to 5)
                    if len(data["examples"]) < 5:
                        data["examples"].append({
                            "game_id": game_id,
                            "ply": ply,
                            "move": move.get("move", ""),
                            "fen_before": move.get("fen_before", ""),
                            "cp_loss": eval_delta,
                            "mistake_type": mistake_type
                        })
    
    # Build entries
    entries = []
    for motif, data in motif_data.items():
        if not data["cp_losses"]:
            continue
        
        count = len(data["cp_losses"])
        avg_cp_loss = sum(data["cp_losses"]) / count / 100.0  # Convert to pawns
        
        # Find critical ply range (10th to 90th percentile)
        plys = sorted(data["plys"])
        if len(plys) >= 3:
            p10 = plys[len(plys) // 10] if len(plys) >= 10 else plys[0]
            p90 = plys[-(len(plys) // 10 + 1)] if len(plys) >= 10 else plys[-1]
            critical_ply_range = [p10, p90]
        else:
            critical_ply_range = [min(plys), max(plys)] if plys else None
        
        # Find top 3 frequent openings
        opening_counts: Dict[str, int] = defaultdict(int)
        for eco in data["openings"]:
            opening_counts[eco] += 1
        frequent_openings = sorted(
            opening_counts.keys(), 
            key=lambda x: opening_counts[x], 
            reverse=True
        )[:3]
        
        # Generate NL insight
        motif_name = motif.replace("_", " ")
        phases = data["phases"]
        top_phase = max(phases, key=phases.get)
        
        nl_insight = (
            f"You most frequently blunder due to {motif_name} ({count} times), "
            f"with an average loss of {abs(avg_cp_loss):.1f} pawns. "
        )
        if frequent_openings:
            nl_insight += f"This occurs most in {', '.join(frequent_openings)}. "
        if critical_ply_range:
            move_range = [
                (critical_ply_range[0] + 1) // 2,
                (critical_ply_range[1] + 1) // 2
            ]
            nl_insight += f"Focus on moves {move_range[0]}-{move_range[1]} ({top_phase})."
        
        entries.append(MistakeMotifEntry(
            motif=motif,
            count=count,
            avg_cp_loss=avg_cp_loss,
            critical_ply_range=critical_ply_range,
            frequent_openings=frequent_openings,
            phase_distribution=PhaseDistribution(**data["phases"]),
            example_moves=data["examples"] if data["examples"] else None,
            nl_insight=nl_insight
        ))
    
    # Sort by impact (count * abs(avg_cp_loss))
    entries.sort(key=lambda e: e.count * abs(e.avg_cp_loss), reverse=True)
    
    return entries


def compute_defensive_motifs(
    move_analyses_by_game: Dict[str, List[Dict[str, Any]]],
    game_eco_map: Dict[str, str],
    eval_swing_threshold: int = 50  # 0.5 pawn
) -> List[DefensiveMotifEntry]:
    """
    Compute tactical motifs where the OPPONENT successfully exploited the user.
    
    Since we only analyze user moves, we infer opponent success by looking at
    positions where the user's eval dropped significantly (opponent made a strong move)
    and tactical patterns are present in the resulting position.
    
    Classification rule:
    - User's subsequent move shows eval_delta drop > threshold
    - Heuristic flags indicate the user is now in a losing tactical situation
    
    Args:
        move_analyses_by_game: {game_id: [move_analysis, ...]}
        game_eco_map: {game_id: eco_code}
        eval_swing_threshold: Minimum eval swing to consider opponent success
    
    Returns:
        List of DefensiveMotifEntry sorted by impact
    """
    # Aggregate data per motif
    motif_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "cp_losses": [],
        "openings": [],
        "phases": {"opening": 0, "middlegame": 0, "endgame": 0},
        "piece_positions": []
    })
    
    for game_id, moves in move_analyses_by_game.items():
        eco = game_eco_map.get(game_id, "")
        
        # Track which patterns we've already counted for this game
        # to avoid inflated counts from the same tactical situation
        patterns_counted_this_game: set = set()
        
        for i, move in enumerate(moves):
            # Look for positions where opponent exploited user significantly
            # We need a BLUNDER-level eval loss (>200cp = 2 pawns) to count
            # as a defensive blind spot
            heuristics = move.get("heuristics", {})
            eval_data = move.get("eval", {})
            cp = eval_data.get("cp", 0)
            eval_delta = move.get("eval_delta", 0)
            
            # Only count when user suffered a SIGNIFICANT loss (blunder-level)
            # Either from a blunder move or being in a very losing position
            is_significant_loss = (
                cp < -200 or  # 2+ pawns down
                eval_delta < -200  # Lost 2+ pawns this move
            )
            
            if not is_significant_loss:
                continue
                
            for pattern in TACTICAL_PATTERNS:
                # Only count each pattern once per game to avoid inflation
                if pattern in patterns_counted_this_game:
                    continue
                    
                if heuristics.get(pattern, False):
                    patterns_counted_this_game.add(pattern)
                    data = motif_data[pattern]
                    data["cp_losses"].append(cp)
                    
                    if eco:
                        data["openings"].append(eco)
                    
                    ply = move.get("ply", 0)
                    phase = get_game_phase(ply)
                    data["phases"][phase] += 1
                    
                    # Try to identify piece pattern from FEN
                    fen = move.get("fen_after", "")
                    if fen and len(data["piece_positions"]) < 5:
                        # Simple extraction: just note the pattern type
                        data["piece_positions"].append(
                            f"{pattern.replace('_', ' ')} detected at ply {ply}"
                        )
    
    # Build entries
    entries = []
    for motif, data in motif_data.items():
        if not data["cp_losses"]:
            continue
        
        count = len(data["cp_losses"])
        avg_cp_loss = sum(data["cp_losses"]) / count / 100.0  # Convert to pawns
        
        # Find top 3 vulnerable openings
        opening_counts: Dict[str, int] = defaultdict(int)
        for eco in data["openings"]:
            opening_counts[eco] += 1
        vulnerable_openings = sorted(
            opening_counts.keys(), 
            key=lambda x: opening_counts[x], 
            reverse=True
        )[:3]
        
        # Unique piece patterns
        piece_patterns = list(set(data["piece_positions"]))[:5]
        
        # Generate NL insight
        motif_name = motif.replace("_", " ")
        phases = data["phases"]
        top_phase = max(phases, key=phases.get)
        
        nl_insight = (
            f"Opponents successfully executed {motif_name} against you {count} times. "
            f"This indicates a defensive blind spot. "
        )
        if vulnerable_openings:
            nl_insight += f"Most vulnerable in {', '.join(vulnerable_openings)}. "
        nl_insight += f"This happens primarily in the {top_phase}."
        
        entries.append(DefensiveMotifEntry(
            motif=motif,
            count=count,
            avg_cp_loss=avg_cp_loss,
            vulnerable_openings=vulnerable_openings,
            piece_patterns=piece_patterns,
            phase_distribution=PhaseDistribution(**data["phases"]),
            nl_insight=nl_insight
        ))
    
    # Sort by impact (count * abs(avg_cp_loss))
    entries.sort(key=lambda e: e.count * abs(e.avg_cp_loss), reverse=True)
    
    return entries


def generate_tactical_insights(
    move_analyses_by_game: Dict[str, List[Dict[str, Any]]],
    weak_lines: List[Dict[str, Any]],
    total_games: int
) -> List[RepertoireInsight]:
    """
    Generate tactical insights from move analyses and weak lines.
    (Legacy function for backward compatibility)

    Args:
        move_analyses_by_game: Dictionary mapping game_id to list of move analysis dicts
        weak_lines: List of weak line dictionaries
        total_games: Total number of games analyzed

    Returns:
        List of RepertoireInsight objects
    """
    insights = []

    # 1. Tactical Weakness Insights (High Priority)
    # Count occurrences of each heuristic pattern ONLY when user made a mistake
    pattern_counts = defaultdict(int)
    for game_id, move_analyses in move_analyses_by_game.items():
        for move_analysis in move_analyses:
            # Only count patterns when user made a BLUNDER (significant error)
            # Note: heuristics detect positional features, not tactical causes,
            # so we only count the most significant errors to avoid inflation
            mistake_type = move_analysis.get("mistake_type")
            if mistake_type != "blunder":
                continue
            
            heuristics = move_analysis.get("heuristics", {})
            for pattern in TACTICAL_PATTERNS:
                if heuristics.get(pattern, False):
                    pattern_counts[pattern] += 1

    # Generate insights for patterns that appear 3+ times
    for pattern, count in pattern_counts.items():
        if count >= 3:
            pattern_name = pattern.replace("_", " ").title()
            insights.append(RepertoireInsight(
                type="warning",
                message=f"You consistently blunder by {pattern_name.lower()} (appeared {count} times).",
                opening_eco=None,
                priority="high"
            ))

    # 2. Line-Level Insights (High Priority)
    for weak_line in weak_lines:
        if (weak_line.get("games_count", 0) >= 3 and
            weak_line.get("winrate", 1.0) < 0.40 and
            weak_line.get("avg_eval_swing", 0) < -0.7):
            
            line_moves = weak_line.get("line", [])
            line_display = ", ".join(line_moves[:6])
            if len(line_moves) > 6:
                line_display += "..."
            
            winrate_pct = int(weak_line.get("winrate", 0) * 100)
            eval_swing = weak_line.get("avg_eval_swing", 0)
            tactical_issues = weak_line.get("tactical_issues", [])
            
            issues_str = ", ".join(tactical_issues[:3]) if tactical_issues else "positional issues"
            
            insights.append(RepertoireInsight(
                type="warning",
                message=f"Line {line_display} has {winrate_pct}% winrate with avg eval swing {eval_swing:.1f}. Common issues: {issues_str}.",
                opening_eco=weak_line.get("eco"),
                priority="high"
            ))

    # 3. Puzzle-Linked Insights (Medium Priority)
    for weak_line in weak_lines:
        puzzle_ids = weak_line.get("puzzle_ids", [])
        if len(puzzle_ids) > 0:
            line_moves = weak_line.get("line", [])
            line_display = ", ".join(line_moves[:4])
            if len(line_moves) > 4:
                line_display += "..."
            
            tactical_issues = weak_line.get("tactical_issues", [])
            issue = tactical_issues[0] if tactical_issues else "positional play"
            
            insights.append(RepertoireInsight(
                type="suggestion",
                message=f"Practice line {line_display}... with {len(puzzle_ids)} puzzles to improve {issue}.",
                opening_eco=weak_line.get("eco"),
                priority="medium"
            ))

    # Sort insights by priority (high -> medium -> low)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    insights.sort(key=lambda x: priority_order.get(x.priority, 3))

    return insights

