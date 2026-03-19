"""
Playstyle Profile Service

Computes player style scores from an already-built RepertoireReport.
Uses ONLY existing report data - no external API or Stockfish calls.

Style axes:
- tactical vs positional: Based on tactical motifs and eval volatility
- aggressive vs defensive: Based on eval swings and comeback rate
- open vs closed: Based on ECO family preferences and winrates

Population normalization (Phase 4):
- Computes raw aggression/volatility from report move data
- Normalizes against population_style_stats baselines
- Computes style entropy from archetype similarities
"""

from typing import Dict, List, Optional, Any, Literal, TYPE_CHECKING
from collections import defaultdict
from dataclasses import dataclass
from pydantic import BaseModel
import math
import statistics

from ..models.repertoire import (
    RepertoireReport,
    PlaystyleProfile,
    StyleScore,
    StyleAlignment,
    RepertoireGroup,
    RepertoireFitItem,
)
from .opening_style_config import get_style_tags, is_open_opening, is_closed_opening

# Conditional imports to avoid circular dependencies
if TYPE_CHECKING:
    import asyncpg


# =============================================================================
# Population-Normalized Metrics Models (for report storage)
# =============================================================================

class NormalizedMetric(BaseModel):
    """A single metric normalized against population baselines."""
    raw: float
    relative_z: float  # Z-score: (value - mean) / std
    percentile: int    # Approximate percentile (0-100)
    bucket: str        # e.g. "1600 blitz"
    interpretation: str  # Human-readable interpretation
    confidence: Literal["low", "medium", "high"]  # Based on sample size

    class Config:
        extra = "forbid"


class EntropyMetric(BaseModel):
    """Style entropy metric indicating play consistency."""
    value: float       # Normalized entropy (0-1)
    label: str         # "specialist" | "hybrid" | "universal" | "experimental"
    interpretation: str  # Human-readable interpretation

    class Config:
        extra = "forbid"


class PopulationNormalizedMetrics(BaseModel):
    """All population-normalized style metrics stored in report."""
    aggression: Optional[NormalizedMetric] = None
    volatility: Optional[NormalizedMetric] = None
    style_entropy: Optional[EntropyMetric] = None
    # Context for debugging/auditing
    rating_bucket: Optional[int] = None
    speed: Optional[str] = None
    era: Optional[str] = None
    sample_games: Optional[int] = None

    class Config:
        extra = "forbid"


# Import style normalization service (available at runtime)
try:
    from .style_normalization_service import (
        normalize_user_style_async,
        rating_bucket as compute_rating_bucket,
        era_bucket as compute_era_bucket,
    )
    from .style_embeddings import (
        compute_style_embedding,
        find_similar_style,
        ARCHETYPE_STYLES,
        compute_style_entropy,
        interpret_entropy,
    )
    NORMALIZATION_AVAILABLE = True
except ImportError:
    NORMALIZATION_AVAILABLE = False


# =============================================================================
# Raw Metric Computation (from report data)
# =============================================================================

def _compute_raw_aggression(report: RepertoireReport) -> float:
    """
    Compute raw aggression score from report's move analysis.
    
    Aggression is measured by:
    - High eval volatility (big swings)
    - Tactical patterns played
    - Games with initiative
    
    Returns:
        Aggression score in [0, 1]
    """
    if not report.engine_analysis or not report.engine_analysis.get("moves"):
        return 0.0
    
    moves = report.engine_analysis["moves"]
    total_moves = len(moves)
    
    if total_moves == 0:
        return 0.0
    
    # Count aggressive indicators
    high_volatility_count = 0
    tactical_count = 0
    
    tactical_patterns = ["fork", "pin", "skewer", "xray", "discovered_attack"]
    
    for move in moves:
        eval_delta = abs(move.get("eval_delta", 0))
        heuristics = move.get("heuristics", {})
        
        # High volatility moves (>100 cp swing = 1 pawn)
        if eval_delta > 100:
            high_volatility_count += 1
        
        # Tactical patterns (successful execution)
        mistake_type = move.get("mistake_type")
        if mistake_type is None:  # Not a mistake
            if any(heuristics.get(p, False) for p in tactical_patterns):
                tactical_count += 1
    
    # Combine factors: weight volatility 60%, tactics 40%
    volatility_ratio = high_volatility_count / total_moves
    tactical_ratio = tactical_count / total_moves
    
    raw = 0.6 * volatility_ratio + 0.4 * tactical_ratio * 5  # Scale up tactics
    return min(1.0, raw)  # Cap at 1.0


def _compute_raw_volatility(report: RepertoireReport) -> float:
    """
    Compute raw volatility as std(eval_delta) over first 20 plies.
    
    This measures how "wild" the positions get in the opening phase.
    
    Returns:
        Standard deviation of eval deltas (centipawns)
    """
    if not report.engine_analysis or not report.engine_analysis.get("moves"):
        return 0.0
    
    moves = report.engine_analysis["moves"]
    
    # Only consider first 20 plies per game
    early_deltas = []
    for move in moves:
        ply = move.get("ply", 99)
        if ply < 20:
            delta = move.get("eval_delta", 0)
            early_deltas.append(delta)
    
    if len(early_deltas) < 5:
        return 0.0
    
    try:
        return statistics.stdev(early_deltas)
    except statistics.StatisticsError:
        return 0.0


def _get_dominant_time_control(report: RepertoireReport) -> str:
    """Get the most common time control from the report."""
    if not report.time_control_breakdown:
        return "blitz"  # Default
    
    # Find time control with most games
    max_games = 0
    dominant = "blitz"
    
    for tc in report.time_control_breakdown:
        games = tc.get("games", 0)
        if games > max_games:
            max_games = games
            dominant = tc.get("key", "blitz")
    
    return dominant


def _estimate_user_rating(report: RepertoireReport) -> int:
    """Estimate user's rating from report data. Default to 1600 if unknown."""
    # Could be enhanced to use actual user rating from request
    return 1600


# =============================================================================
# Async Population Normalization
# =============================================================================

async def compute_population_normalized_metrics(
    report: RepertoireReport,
    pool: "asyncpg.Pool",
    rating: Optional[int] = None,
    speed: Optional[str] = None,
    era: str = "all",
    color: str = "white",
) -> Optional[PopulationNormalizedMetrics]:
    """
    Compute population-normalized style metrics for a report.
    
    This is the main integration point - called during report generation.
    It queries population_style_stats and computes relative scores.
    
    Args:
        report: The report containing move analysis
        pool: Database connection pool
        rating: User's rating (will estimate if not provided)
        speed: Time control filter (will detect from report if not provided)
        era: Era bucket (default "all" for recent data)
        color: Color to normalize (aggregated across both if "both")
    
    Returns:
        PopulationNormalizedMetrics or None if normalization unavailable
    """
    if not NORMALIZATION_AVAILABLE:
        print("[PopulationMetrics] Normalization service not available")
        return None
    
    # Determine context from report if not provided
    if rating is None:
        rating = _estimate_user_rating(report)
    if speed is None:
        speed = _get_dominant_time_control(report)
    
    rating_bucket = compute_rating_bucket(rating)
    bucket_label = f"{rating_bucket} {speed}"
    
    # Compute raw metrics from report
    raw_aggression = _compute_raw_aggression(report)
    raw_volatility = _compute_raw_volatility(report)
    
    print(f"[PopulationMetrics] Raw aggression={raw_aggression:.3f}, volatility={raw_volatility:.1f}")
    
    sample_size = report.total_games
    confidence = "low"
    if sample_size >= 50:
        confidence = "high"
    elif sample_size >= 20:
        confidence = "medium"

    # Initialize result
    result = PopulationNormalizedMetrics(
        rating_bucket=rating_bucket,
        speed=speed,
        era=era,
        sample_games=sample_size,
    )
    
    # Normalize aggression
    try:
        async with pool.acquire() as conn:
            agg_score = await normalize_user_style_async(
                conn, raw_aggression, rating, speed, era, color, "aggression"
            )
            if agg_score:
                result.aggression = NormalizedMetric(
                    raw=round(raw_aggression, 4),
                    relative_z=round(agg_score.z_score, 2),
                    percentile=int(agg_score.percentile),
                    bucket=bucket_label,
                    interpretation=agg_score.interpretation,
                    confidence=confidence,
                )
    except Exception as e:
        print(f"[PopulationMetrics] Failed to normalize aggression: {e}")
    
    # Normalize volatility
    try:
        async with pool.acquire() as conn:
            vol_score = await normalize_user_style_async(
                conn, raw_volatility, rating, speed, era, color, "volatility"
            )
            if vol_score:
                result.volatility = NormalizedMetric(
                    raw=round(raw_volatility, 2),
                    relative_z=round(vol_score.z_score, 2),
                    percentile=int(vol_score.percentile),
                    bucket=bucket_label,
                    interpretation=vol_score.interpretation,
                    confidence=confidence,
                )
    except Exception as e:
        print(f"[PopulationMetrics] Failed to normalize volatility: {e}")
    
    # Compute style entropy from archetype similarities
    try:
        # Use existing style embedding computation
        player_stats = {
            "avg_eval_swing": raw_volatility,
            "eval_variance": raw_volatility ** 2 if raw_volatility else 0,
        }
        style_vector = compute_style_embedding(player_stats)
        
        # Get similarities to all archetypes
        all_matches = find_similar_style(style_vector, ARCHETYPE_STYLES, top_k=len(ARCHETYPE_STYLES))
        similarities = [sim for _, sim in all_matches]
        
        # Compute entropy
        raw_entropy, normalized_entropy = compute_style_entropy(similarities)
        category, description = interpret_entropy(normalized_entropy)
        
        result.style_entropy = EntropyMetric(
            value=round(normalized_entropy, 3),
            label=category,
            interpretation=description,
        )
    except Exception as e:
        print(f"[PopulationMetrics] Failed to compute style entropy: {e}")
    
    return result


def compute_playstyle_profile(report: RepertoireReport) -> PlaystyleProfile:
    """
    Compute playstyle profile from an already-built report.
    Uses ONLY existing report data - no external API or Stockfish calls.
    
    Args:
        report: A fully constructed RepertoireReport
        
    Returns:
        PlaystyleProfile with overall, white, and black style scores
    """
    # Compute style for each color and overall
    overall = _compute_style_for_color(report, color=None)
    white = _compute_style_for_color(report, color="white")
    black = _compute_style_for_color(report, color="black")
    
    # Radar chart axes
    axes = ["Tactical", "Positional", "Aggressive", "Defensive", "Open", "Closed"]
    
    # Generate summary and recommendations
    summary = _generate_summary(overall, white, black)
    recommendations = _generate_recommendations(overall, white, black, report)
    
    # Compute opening alignment (Phase 2)
    aligned, misaligned, neutral = _compute_opening_alignments(report, white, black)
    
    profile = PlaystyleProfile(
        overall=overall,
        white=white,
        black=black,
        radar_axes=axes,
        radar_data_overall=_to_radar(overall),
        radar_data_white=_to_radar(white),
        radar_data_black=_to_radar(black),
        summary=summary,
        recommendations=recommendations,
        aligned_openings=aligned,
        misaligned_openings=misaligned,
        neutral_openings=neutral,
    )
    
    return profile


def _to_radar(score: StyleScore) -> List[float]:
    """Convert StyleScore to radar chart data array."""
    return [
        score.tactical,
        score.positional,
        score.aggressive,
        score.defensive,
        score.open_positions,
        score.closed_positions,
    ]


def _normalize_pair(a: float, b: float) -> tuple[float, float]:
    """
    Normalize a pair of values so they sum to 1.
    If both are zero, return (0.5, 0.5) for balanced scores.
    """
    total = a + b
    if total <= 0:
        return 0.5, 0.5
    return a / total, b / total


def _smoothed_rate(
    successes: float,
    trials: float,
    prior_mean: float,
    prior_weight: float
) -> float:
    """
    Compute a Laplace/Bayesian-smoothed success rate.
    Helps avoid unstable 0/1 jumps when sample counts are small.
    """
    safe_trials = max(0.0, trials)
    safe_successes = max(0.0, min(successes, safe_trials))
    if prior_weight <= 0:
        return (safe_successes / safe_trials) if safe_trials > 0 else prior_mean
    return (safe_successes + prior_mean * prior_weight) / (safe_trials + prior_weight)


def _resolve_move_color(
    move: Dict[str, Any],
    fallback_color: Optional[Literal["white", "black"]],
) -> Optional[Literal["white", "black"]]:
    """Resolve user color for a move, preferring per-move metadata."""
    move_color = move.get("user_color")
    if move_color in ("white", "black"):
        return move_color
    return fallback_color


def _to_user_perspective_eval(
    eval_cp: float,
    move_color: Optional[Literal["white", "black"]],
) -> float:
    """
    Convert Stockfish cp score (white perspective) to user's perspective.
    Positive means good for the user regardless of user color.
    """
    if move_color == "black":
        return -eval_cp
    return eval_cp


def _to_user_perspective_delta(
    eval_delta: float,
    move_color: Optional[Literal["white", "black"]],
) -> float:
    """
    Convert cp delta (white perspective) to user's perspective.
    Positive means user improved their position.
    """
    if move_color == "black":
        return -eval_delta
    return eval_delta


def _clamp(value: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    """Clamp a value to [min_val, max_val]."""
    return max(min_val, min(max_val, value))


def _compute_style_for_color(
    report: RepertoireReport, 
    color: Optional[Literal["white", "black"]]
) -> StyleScore:
    """
    Compute style scores for a specific color or overall.
    
    Args:
        report: The RepertoireReport
        color: "white", "black", or None for overall
        
    Returns:
        StyleScore with normalized scores on each axis
    """
    # Initialize raw scores
    tactical_raw = 0.0
    positional_raw = 0.0
    aggressive_raw = 0.0
    defensive_raw = 0.0
    open_raw = 0.0
    closed_raw = 0.0
    
    # =========================================
    # 1. Tactical vs Positional from move analysis
    # =========================================
    moves = _get_moves_for_color(report, color)
    
    if moves:
        tactical_motif_count = 0
        low_volatility_count = 0
        total_moves_analyzed = len(moves)
        
        for move in moves:
            heuristics = move.get("heuristics", {})
            mistake_type = move.get("mistake_type")
            eval_delta = abs(move.get("eval_delta", 0))
            
            # Count tactical motifs (successful ones - not resulting in mistakes)
            tactical_patterns = ["fork", "pin", "skewer", "xray", "discovered_attack"]
            has_tactical_motif = any(heuristics.get(p, False) for p in tactical_patterns)
            
            if has_tactical_motif and mistake_type is None:
                tactical_motif_count += 1
            
            # Low volatility moves indicate positional play
            if eval_delta < 30:  # Less than 0.30 pawns change
                low_volatility_count += 1
        
        if total_moves_analyzed > 0:
            # Tactical score: proportion of moves with successful tactics
            tactical_raw = (tactical_motif_count / total_moves_analyzed) * 5  # Scale up
            # Positional score: proportion of moves with low volatility
            positional_raw = low_volatility_count / total_moves_analyzed
    
    # =========================================
    # 2. Aggressive vs Defensive from eval patterns
    # =========================================
    if moves:
        high_volatility_count = 0
        comeback_count = 0
        bad_position_count = 0
        total_game_ids = set()
        
        for move in moves:
            move_color = _resolve_move_color(move, color)
            game_id = move.get("game_id")
            if game_id:
                total_game_ids.add(game_id)
            
            eval_delta = move.get("eval_delta", 0)
            eval_before = move.get("eval", {}).get("cp", 0)
            eval_before_user = _to_user_perspective_eval(eval_before, move_color)
            eval_delta_user = _to_user_perspective_delta(eval_delta, move_color)
            
            # High volatility (aggressive moves)
            if abs(eval_delta) > 100:  # More than 1 pawn swing
                high_volatility_count += 1
            
            # Track bad positions and comebacks
            if eval_before_user < -100:  # User was worse (user perspective)
                bad_position_count += 1
                # If moved and improved position significantly
                if eval_delta_user > 50:
                    comeback_count += 1
        
        total_moves_analyzed = len(moves)
        if total_moves_analyzed > 0:
            # Aggressive: smoothed high-volatility ratio to reduce 0/1 flips.
            volatility_ratio = _smoothed_rate(
                successes=high_volatility_count,
                trials=total_moves_analyzed,
                prior_mean=0.08,   # Typical fraction of sharp swings
                prior_weight=20.0, # Modest prior to stabilize small samples
            )
            aggressive_raw = min(1.0, volatility_ratio * 3)

            # Defensive: smoothed comeback rate so "no comebacks yet" isn't hard-zero.
            defensive_raw = _smoothed_rate(
                successes=comeback_count,
                trials=bad_position_count,
                prior_mean=0.3,
                prior_weight=5.0,
            )
    
    # =========================================
    # 3. Open vs Closed from repertoire ECO analysis
    # =========================================
    repertoires = _get_repertoires_for_color(report, color)
    
    open_games = 0
    open_wins = 0
    closed_games = 0
    closed_wins = 0
    
    for category, group in repertoires.items():
        if not group or not hasattr(group, 'openings'):
            continue
        for opening in group.openings:
            eco = opening.eco_code
            games = opening.games_count
            wins = opening.wins
            
            if is_open_opening(eco):
                open_games += games
                open_wins += wins
            elif is_closed_opening(eco):
                closed_games += games
                closed_wins += wins
    
    # Calculate winrates in open vs closed positions
    open_winrate = (open_wins / open_games) if open_games > 0 else 0.5
    closed_winrate = (closed_wins / closed_games) if closed_games > 0 else 0.5
    
    # Weight by both frequency and performance
    total_categorized = open_games + closed_games
    if total_categorized > 0:
        open_freq = open_games / total_categorized
        closed_freq = closed_games / total_categorized
        
        # Combine frequency and winrate
        open_raw = (open_freq * 0.4 + open_winrate * 0.6)
        closed_raw = (closed_freq * 0.4 + closed_winrate * 0.6)
    else:
        open_raw = 0.5
        closed_raw = 0.5
    
    # =========================================
    # Normalize pairs and create StyleScore
    # =========================================
    tactical, positional = _normalize_pair(tactical_raw, positional_raw)
    aggressive, defensive = _normalize_pair(aggressive_raw, defensive_raw)
    open_pos, closed_pos = _normalize_pair(open_raw, closed_raw)
    
    return StyleScore(
        tactical=_clamp(tactical),
        positional=_clamp(positional),
        aggressive=_clamp(aggressive),
        defensive=_clamp(defensive),
        open_positions=_clamp(open_pos),
        closed_positions=_clamp(closed_pos),
        risk=None,  # Optional, not computed in Phase 1
    )


def _get_moves_for_color(
    report: RepertoireReport, 
    color: Optional[Literal["white", "black"]]
) -> List[Dict[str, Any]]:
    """
    Get move analyses filtered by which color the user played as.
    
    Args:
        report: The RepertoireReport
        color: "white" = only moves from games where user was white,
               "black" = only moves from games where user was black,
               None = all moves (both colors)
    
    Returns:
        List of move analysis dicts
    """
    if not report.engine_analysis or not report.engine_analysis.get("moves"):
        return []
    
    moves = report.engine_analysis["moves"]
    
    if color is None:
        return moves
    
    # Filter by user_color field (which color the user played as in that game)
    return [m for m in moves if m.get("user_color") == color]


def _get_repertoires_for_color(
    report: RepertoireReport, 
    color: Optional[Literal["white", "black"]]
) -> Dict[str, RepertoireGroup]:
    """Get repertoire groups for a specific color or combined."""
    if color == "white":
        return report.white_repertoire or {}
    elif color == "black":
        return report.black_repertoire or {}
    else:
        # Combine both
        combined = {}
        if report.white_repertoire:
            combined.update(report.white_repertoire)
        if report.black_repertoire:
            for cat, group in report.black_repertoire.items():
                if cat in combined:
                    # Merge openings
                    combined_group = combined[cat]
                    if hasattr(combined_group, 'openings') and hasattr(group, 'openings'):
                        combined_group.openings.extend(group.openings)
                else:
                    combined[cat] = group
        return combined


def _generate_summary(
    overall: StyleScore, 
    white: StyleScore, 
    black: StyleScore
) -> str:
    """Generate a natural language summary of the playstyle."""
    parts = []
    
    # Tactical vs Positional
    if overall.tactical > 0.6:
        parts.append("You have a tactical playing style, thriving in sharp positions with concrete calculations.")
    elif overall.positional > 0.6:
        parts.append("You favor a positional approach, building advantages through strategic maneuvering.")
    else:
        parts.append("You have a balanced style, comfortable in both tactical and positional positions.")

    # Aggressive vs Defensive
    if overall.aggressive > 0.6:
        parts.append("Your play tends to be aggressive, often creating imbalances and complications.")
    elif overall.defensive > 0.6:
        parts.append("You show solid defensive skills, excelling at holding difficult positions.")

    # Open vs Closed
    if overall.open_positions > 0.65:
        parts.append("You perform better in open positions with active piece play.")
    elif overall.closed_positions > 0.65:
        parts.append("You excel in closed positions requiring patient maneuvering.")
    
    # Color differences
    if abs(white.tactical - black.tactical) > 0.2:
        if white.tactical > black.tactical:
            parts.append("You play more tactically as White than as Black.")
        else:
            parts.append("You play more tactically as Black than as White.")
    
    return " ".join(parts) if parts else "Your playstyle profile shows a balanced approach across all dimensions."


def _generate_recommendations(
    overall: StyleScore, 
    white: StyleScore, 
    black: StyleScore,
    report: RepertoireReport
) -> List[str]:
    """Generate style-based recommendations."""
    recommendations = []
    
    # Tactical player with low aggression might be missing opportunities
    if overall.tactical > 0.6 and overall.aggressive < 0.4:
        recommendations.append("Consider more aggressive openings to capitalize on your tactical skills.")
    
    # Positional player with high open position preference might benefit from closed openings
    if overall.positional > 0.6 and overall.open_positions > 0.6:
        recommendations.append("Your positional style might shine even more in closed structures - try the French or Caro-Kann.")
    
    # Defensive player might want to expand tactical training
    if overall.defensive > 0.65 and overall.tactical < 0.35:
        recommendations.append("Working on tactical puzzles could help you find more counterattacking opportunities.")
    
    # High aggression but low open position winrate
    if overall.aggressive > 0.6 and overall.open_positions < 0.4:
        recommendations.append("Your aggressive style could be better served by openings leading to open positions.")
    
    # Color imbalance suggestions
    if white.tactical > 0.6 and black.tactical < 0.4:
        recommendations.append("Consider sharper defenses as Black to match your tactical White repertoire.")
    
    if black.tactical > 0.6 and white.tactical < 0.4:
        recommendations.append("Try more aggressive openings as White to utilize your tactical abilities.")
    
    return recommendations[:3]  # Limit to top 3 recommendations


def _compute_opening_alignments(
    report: RepertoireReport,
    white_style: StyleScore,
    black_style: StyleScore
) -> tuple[List[StyleAlignment], List[StyleAlignment], List[StyleAlignment]]:
    """
    Compute opening alignments by comparing each opening's style tags
    with the user's style profile for that color.
    
    Returns:
        Tuple of (aligned_openings, misaligned_openings, neutral_openings)
    """
    aligned: List[StyleAlignment] = []
    misaligned: List[StyleAlignment] = []
    neutral: List[StyleAlignment] = []
    
    # Process white repertoire
    if report.white_repertoire:
        for category, group in report.white_repertoire.items():
            if not group or not hasattr(group, 'openings'):
                continue
            for opening in group.openings:
                alignment = _compute_single_alignment(
                    opening.eco_code,
                    opening.opening_name,
                    "white",
                    category,
                    white_style
                )
                if alignment:
                    if alignment.alignment_score >= 0.7:
                        aligned.append(alignment)
                    elif alignment.alignment_score <= 0.3:
                        misaligned.append(alignment)
                    else:
                        neutral.append(alignment)
    
    # Process black repertoire
    if report.black_repertoire:
        for category, group in report.black_repertoire.items():
            if not group or not hasattr(group, 'openings'):
                continue
            for opening in group.openings:
                alignment = _compute_single_alignment(
                    opening.eco_code,
                    opening.opening_name,
                    "black",
                    category,
                    black_style
                )
                if alignment:
                    if alignment.alignment_score >= 0.7:
                        aligned.append(alignment)
                    elif alignment.alignment_score <= 0.3:
                        misaligned.append(alignment)
                    else:
                        neutral.append(alignment)
    
    # Sort by alignment score
    aligned.sort(key=lambda x: x.alignment_score, reverse=True)
    misaligned.sort(key=lambda x: x.alignment_score)
    neutral.sort(key=lambda x: x.alignment_score, reverse=True)
    
    return aligned, misaligned, neutral


def _compute_single_alignment(
    eco: str,
    opening_name: str,
    color: Literal["white", "black"],
    category: str,
    style: StyleScore
) -> Optional[StyleAlignment]:
    """
    Compute alignment score for a single opening.
    
    Uses cosine similarity between the opening's style vector
    and the user's style vector.
    """
    tags = get_style_tags(eco)
    
    if not tags:
        # Unknown opening, return neutral alignment
        return StyleAlignment(
            eco=eco,
            opening_name=opening_name,
            color=color,
            bucket=_map_category_to_bucket(category),
            alignment_score=0.5,  # Neutral
            tags=[]
        )
    
    # Build opening style vector from tags [tactical, positional, aggressive, defensive, open, closed]
    opening_vector = [
        1.0 if "tactical" in tags else 0.0,
        1.0 if "positional" in tags else 0.0,
        1.0 if "aggressive" in tags else 0.0,
        1.0 if "defensive" in tags else 0.0,
        1.0 if "open" in tags else 0.0,
        1.0 if "closed" in tags else 0.0,
    ]
    
    # Build user style vector
    user_vector = [
        style.tactical,
        style.positional,
        style.aggressive,
        style.defensive,
        style.open_positions,
        style.closed_positions,
    ]
    
    # Compute cosine similarity
    alignment_score = _cosine_similarity(opening_vector, user_vector)
    
    return StyleAlignment(
        eco=eco,
        opening_name=opening_name,
        color=color,
        bucket=_map_category_to_bucket(category),
        alignment_score=_clamp(alignment_score),
        tags=tags
    )


def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(b * b for b in vec2))
    
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.5  # Neutral if either vector is zero
    
    return dot_product / (magnitude1 * magnitude2)


def _map_category_to_bucket(category: str) -> Optional[Literal["core", "secondary", "experimental", "problem"]]:
    """Map repertoire category to bucket type."""
    mapping = {
        "core": "core",
        "repair": "problem",
        "expansion": "secondary",
        "experimental": "experimental",
        "developing": "secondary",
    }
    result = mapping.get(category)
    if result in ("core", "secondary", "experimental", "problem"):
        return result  # type: ignore
    return None


def annotate_openings_with_style(report: RepertoireReport) -> None:
    """
    Annotate each opening in the report with style alignment data.
    Mutates openings in-place: fills style_tags, style_alignment_score, style_fit_label.
    
    Should be called after compute_playstyle_profile has set report.playstyle_profile.
    """
    profile = report.playstyle_profile
    if not profile:
        return
    
    # Get style vectors for each color
    white_style = profile.white
    black_style = profile.black
    
    def annotate_opening(opening, style: StyleScore) -> None:
        """Annotate a single opening with style alignment."""
        tags = get_style_tags(opening.eco_code)
        opening.style_tags = tags
        
        if not tags:
            opening.style_alignment_score = 0.5
            opening.style_fit_label = "neutral"
            return
        
        # Build opening style vector from tags
        opening_vector = [
            1.0 if "tactical" in tags else 0.0,
            1.0 if "positional" in tags else 0.0,
            1.0 if "aggressive" in tags else 0.0,
            1.0 if "defensive" in tags else 0.0,
            1.0 if "open" in tags else 0.0,
            1.0 if "closed" in tags else 0.0,
        ]
        
        # Build user style vector
        user_vector = [
            style.tactical,
            style.positional,
            style.aggressive,
            style.defensive,
            style.open_positions,
            style.closed_positions,
        ]
        
        # Compute cosine similarity
        score = _cosine_similarity(opening_vector, user_vector)
        opening.style_alignment_score = _clamp(score)
        
        if score >= 0.6:
            opening.style_fit_label = "aligned"
        elif score <= 0.3:
            opening.style_fit_label = "misaligned"
        else:
            opening.style_fit_label = "neutral"
    
    # Annotate white repertoire openings
    if report.white_repertoire:
        for category, group in report.white_repertoire.items():
            if group and hasattr(group, 'openings'):
                for opening in group.openings:
                    annotate_opening(opening, white_style)
    
    # Annotate black repertoire openings
    if report.black_repertoire:
        for category, group in report.black_repertoire.items():
            if group and hasattr(group, 'openings'):
                for opening in group.openings:
                    annotate_opening(opening, black_style)


def build_repertoire_fit(report: RepertoireReport) -> List[RepertoireFitItem]:
    """
    Build repertoire fit list from user's chosen openings only.
    Excludes opponent responses (user_is_system_side == False).
    
    Should be called after annotate_openings_with_style has run.
    
    Returns:
        List of RepertoireFitItem for user's chosen systems
    """
    items: List[RepertoireFitItem] = []
    
    # Map category names to bucket types
    category_to_bucket = {
        "core": "core",
        "repair": "repair",
        "expansion": "secondary",
        "experimental": "experimental",
        "developing": "secondary",
    }
    
    def add_from_repertoire(repertoire: Dict[str, RepertoireGroup], color: str) -> None:
        if not repertoire:
            return
        for category, group in repertoire.items():
            if not group or not hasattr(group, 'openings'):
                continue
            bucket_type = category_to_bucket.get(category, "secondary")
            for opening in group.openings:
                # Only include user's chosen systems
                if not getattr(opening, 'user_is_system_side', True):
                    continue
                # Skip if no style data
                if getattr(opening, 'style_alignment_score', None) is None:
                    continue
                
                items.append(RepertoireFitItem(
                    eco=opening.eco_code,
                    opening_name=opening.opening_name,
                    color=color,
                    bucket_type=bucket_type,  # type: ignore
                    games_count=opening.games_count,
                    winrate=opening.winrate,
                    style_alignment_score=opening.style_alignment_score or 0.5,
                    style_fit_label=getattr(opening, 'style_fit_label', 'neutral') or 'neutral',
                    style_tags=getattr(opening, 'style_tags', []) or [],
                ))
    
    add_from_repertoire(report.white_repertoire, "white")
    add_from_repertoire(report.black_repertoire, "black")
    
    # Sort by style alignment score descending
    items.sort(key=lambda x: x.style_alignment_score, reverse=True)
    
    return items
