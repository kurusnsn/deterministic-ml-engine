"""
Opening Residuals Service.

Raw winrate is misleading in bulk data. Residuals give rating-aware performance
by comparing actual results to expected results based on Elo rating difference.

This is Step 4 of the ML pipeline augmentation.

Feature flag: ml_config.opening_residuals
"""

from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from collections import defaultdict

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig

from ..models.explain import ResidualExplain


def compute_elo_expected_score(player_rating: int, opponent_rating: int) -> float:
    """
    Compute Elo expected score.
    
    Formula: E = 1 / (1 + 10^((opponent - player) / 400))
    
    Args:
        player_rating: Player's Elo rating
        opponent_rating: Opponent's Elo rating
        
    Returns:
        Expected score in [0, 1]
        - 0.5 = equal ratings
        - > 0.5 = player is stronger
        - < 0.5 = opponent is stronger
    """
    rating_diff = opponent_rating - player_rating
    exponent = rating_diff / 400.0
    expected = 1.0 / (1.0 + 10 ** exponent)
    return expected


def compute_actual_score(wins: int, draws: int, losses: int) -> float:
    """
    Compute actual score from results.
    
    Formula: (wins + 0.5 * draws) / total_games
    
    Args:
        wins: Number of wins
        draws: Number of draws
        losses: Number of losses
        
    Returns:
        Actual score in [0, 1]
    """
    total = wins + draws + losses
    if total == 0:
        return 0.5  # No games = neutral
    return (wins + 0.5 * draws) / total


def compute_residual_label(residual: float, ml_config: Optional["MLConfig"] = None) -> str:
    """
    Convert residual to label.
    
    Args:
        residual: Residual value (actual - expected)
        ml_config: Optional ML configuration with thresholds
        
    Returns:
        "overperforming", "neutral", or "underperforming"
    """
    overperform_threshold = 0.10
    underperform_threshold = -0.10
    
    if ml_config:
        overperform_threshold = getattr(ml_config, "residual_overperform_threshold", 0.10)
        underperform_threshold = getattr(ml_config, "residual_underperform_threshold", -0.10)
    
    if residual >= overperform_threshold:
        return "overperforming"
    elif residual <= underperform_threshold:
        return "underperforming"
    else:
        return "neutral"


def compute_opening_residual(
    games: List[Dict[str, Any]],
    user_identifier: str,
    eco: str,
    ml_config: Optional["MLConfig"] = None,
) -> Tuple[Dict[str, Any], ResidualExplain]:
    """
    Compute residual for a single opening based on games.
    
    Args:
        games: List of game dicts with ratings and results
        user_identifier: Username to identify user's color
        eco: ECO code for this opening
        ml_config: Optional ML configuration
        
    Returns:
        Tuple of (residual_data, explain)
    """
    if not games:
        return _empty_residual(eco), _empty_explain(eco)
    
    # Check minimum games
    min_games = 5
    if ml_config:
        min_games = getattr(ml_config, "residual_min_games", 5)
    
    if len(games) < min_games:
        return _empty_residual(eco, reason="insufficient_games"), _empty_explain(eco, len(games))
    
    # Aggregate expected scores and results
    expected_scores = []
    wins = 0
    draws = 0
    losses = 0
    
    for game in games:
        # Determine user's color and opponent rating
        white_username = game.get("white_username", "").lower()
        black_username = game.get("black_username", "").lower()
        user_lower = user_identifier.lower()
        
        if user_lower == white_username:
            user_color = "white"
            player_rating = game.get("white_rating", 1500)
            opponent_rating = game.get("black_rating", 1500)
        elif user_lower == black_username:
            user_color = "black"
            player_rating = game.get("black_rating", 1500)
            opponent_rating = game.get("white_rating", 1500)
        else:
            continue  # Skip games where user is not found
        
        # Compute expected score for this game
        expected = compute_elo_expected_score(player_rating, opponent_rating)
        expected_scores.append(expected)
        
        # Count result
        result = game.get("result", "")
        if result == "1-0":
            wins += 1 if user_color == "white" else 0
            losses += 0 if user_color == "white" else 1
        elif result == "0-1":
            losses += 1 if user_color == "white" else 0
            wins += 0 if user_color == "white" else 1
        elif result in ("1/2-1/2", "½-½"):
            draws += 1
        # Other results (e.g., "*") are ignored
    
    if not expected_scores:
        return _empty_residual(eco, reason="no_valid_games"), _empty_explain(eco, 0)
    
    # Compute aggregate scores
    expected_score = sum(expected_scores) / len(expected_scores)
    actual_score = compute_actual_score(wins, draws, losses)
    residual = actual_score - expected_score
    label = compute_residual_label(residual, ml_config)
    
    # Generate rationale
    if residual >= 0.10:
        rationale = f"You're winning {int(residual*100)}% more than expected in {eco}. Strong opening choice!"
    elif residual <= -0.10:
        rationale = f"You're scoring {int(abs(residual)*100)}% below expected in {eco}. Consider studying this opening."
    else:
        rationale = f"Performance in {eco} is roughly as expected for your rating."
    
    residual_data = {
        "eco": eco,
        "games_count": len(games),
        "expected_score": round(expected_score, 3),
        "actual_score": round(actual_score, 3),
        "residual": round(residual, 3),
        "residual_label": label,
        "wins": wins,
        "draws": draws,
        "losses": losses,
    }
    
    explain = ResidualExplain(
        inputs_used={
            "games_count": len(games),
            "avg_player_rating": sum(g.get("white_rating", 1500) for g in games) / len(games),
            "avg_opponent_rating": sum(g.get("black_rating", 1500) for g in games) / len(games),
        },
        scoring_rules={
            "expected": "E = 1 / (1 + 10^((opp-player)/400))",
            "actual": "(wins + 0.5*draws) / total",
            "residual": "actual - expected",
        },
        rationale=rationale,
        sample_size=len(games),
        expected_score=expected_score,
        actual_score=actual_score,
        residual=residual,
    )
    
    return residual_data, explain


def _empty_residual(eco: str, reason: str = "") -> Dict[str, Any]:
    """Return empty residual data."""
    return {
        "eco": eco,
        "games_count": 0,
        "expected_score": None,
        "actual_score": None,
        "residual": None,
        "residual_label": None,
        "reason": reason,
    }


def _empty_explain(eco: str, games_count: int = 0) -> ResidualExplain:
    """Return empty explain object."""
    return ResidualExplain(
        inputs_used={"eco": eco, "games_count": games_count},
        scoring_rules={},
        rationale=f"Insufficient games for {eco} to compute residual.",
        sample_size=games_count,
        expected_score=0.5,
        actual_score=0.5,
        residual=0.0,
    )


def compute_all_opening_residuals(
    games_by_eco: Dict[str, List[Dict[str, Any]]],
    user_identifier: str,
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Compute residuals for all openings.
    
    Args:
        games_by_eco: Dict mapping ECO code to list of games
        user_identifier: Username to identify user's color
        ml_config: Optional ML configuration
        
    Returns:
        Dict mapping ECO code to residual data with explain
    """
    results = {}
    
    for eco, games in games_by_eco.items():
        residual_data, explain = compute_opening_residual(
            games=games,
            user_identifier=user_identifier,
            eco=eco,
            ml_config=ml_config,
        )
        
        # Add explain to residual data
        residual_data["explain"] = explain.model_dump()
        results[eco] = residual_data
    
    return results


def enrich_opening_stats_with_residuals(
    opening_stats: List[Dict[str, Any]],
    residuals: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Add residual data to existing opening stats.
    
    Args:
        opening_stats: List of OpeningStats-like dicts
        residuals: Dict mapping ECO to residual data
        
    Returns:
        Opening stats with residual fields added
    """
    for stats in opening_stats:
        eco = stats.get("eco", "")
        if eco in residuals:
            residual_data = residuals[eco]
            stats["expected_score"] = residual_data.get("expected_score")
            stats["residual"] = residual_data.get("residual")
            stats["residual_label"] = residual_data.get("residual_label")
            stats["residual_explain"] = residual_data.get("explain")
    
    return opening_stats
