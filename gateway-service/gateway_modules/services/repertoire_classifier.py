"""
Repertoire classification and insight generation for chess opening analysis.
"""

from typing import List, Dict
from collections import defaultdict

from ..models.repertoire import OpeningStats, RepertoireGroup, RepertoireInsight
from ..config.repertoire_config import (
    REPERTOIRE_CATEGORIES,
    classify_opening_category,
    INSIGHT_PRIORITIES,
    MIN_GAMES_FOR_INSIGHT,
    MAX_INSIGHTS_PER_CATEGORY
)


def classify_repertoire(opening_stats: List[OpeningStats], color: str) -> Dict[str, RepertoireGroup]:
    """
    Classify openings into repertoire categories based on frequency and performance.

    Args:
        opening_stats: List of OpeningStats for a specific color
        color: "white" or "black"

    Returns:
        Dictionary mapping category names to RepertoireGroup objects
    """
    # Initialize all categories
    repertoire_groups = {}
    for category_name, category_info in REPERTOIRE_CATEGORIES.items():
        repertoire_groups[category_name] = RepertoireGroup(
            category=category_name,
            description=category_info["description"],
            openings=[],
            total_games=0,
            avg_winrate=0.0
        )

    # Classify each opening
    for opening in opening_stats:
        category = classify_opening_category(opening.frequency, opening.winrate, color)
        repertoire_groups[category].openings.append(opening)

    # Calculate aggregate statistics for each group
    for group in repertoire_groups.values():
        if group.openings:
            group.total_games = sum(opening.games_count for opening in group.openings)
            # Weight average winrate by number of games
            total_weighted_winrate = sum(
                opening.winrate * opening.games_count
                for opening in group.openings
            )
            group.avg_winrate = total_weighted_winrate / group.total_games if group.total_games > 0 else 0.0
        else:
            group.total_games = 0
            group.avg_winrate = 0.0

    return repertoire_groups


def generate_insights(white_repertoire: Dict[str, RepertoireGroup],
                     black_repertoire: Dict[str, RepertoireGroup],
                     total_games: int) -> List[RepertoireInsight]:
    """
    Generate actionable insights and recommendations based on repertoire analysis.

    Args:
        white_repertoire: White repertoire groups
        black_repertoire: Black repertoire groups
        total_games: Total number of games analyzed

    Returns:
        List of RepertoireInsight objects ordered by priority
    """
    insights = []

    # Generate insights for each color
    for color, repertoire in [("white", white_repertoire), ("black", black_repertoire)]:
        color_insights = _generate_color_insights(repertoire, color, total_games)
        insights.extend(color_insights)

    # Sort insights by priority (high -> medium -> low)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    insights.sort(key=lambda x: priority_order.get(x.priority, 3))

    return insights


def _generate_color_insights(repertoire: Dict[str, RepertoireGroup], color: str, total_games: int) -> List[RepertoireInsight]:
    """
    Generate insights for a specific color repertoire.

    Args:
        repertoire: Repertoire groups for the color
        color: "white" or "black"
        total_games: Total games for context

    Returns:
        List of insights for this color
    """
    insights = []
    color_title = color.capitalize()

    # Problem areas (repair category) - highest priority
    repair_group = repertoire.get("repair", RepertoireGroup(category="repair", description="", openings=[], total_games=0, avg_winrate=0.0))
    if repair_group.openings:
        # Sort by frequency (most played problems first)
        problem_openings = sorted(repair_group.openings, key=lambda x: x.frequency, reverse=True)

        for opening in problem_openings[:MAX_INSIGHTS_PER_CATEGORY]:
            if opening.games_count >= MIN_GAMES_FOR_INSIGHT:
                winrate_pct = int(opening.winrate * 100)
                frequency_pct = int(opening.frequency * 100)

                insights.append(RepertoireInsight(
                    type="warning",
                    message=f"Your {opening.opening_name} ({opening.eco_code}) as {color} needs work - "
                           f"{opening.games_count} games with {winrate_pct}% winrate ({frequency_pct}% of games)",
                    opening_eco=opening.eco_code,
                    priority="high"
                ))

    # Hidden gems (expansion category) - medium priority
    expansion_group = repertoire.get("expansion", RepertoireGroup(category="expansion", description="", openings=[], total_games=0, avg_winrate=0.0))
    if expansion_group.openings:
        # Sort by winrate (best performers first)
        gem_openings = sorted(expansion_group.openings, key=lambda x: x.winrate, reverse=True)

        for opening in gem_openings[:MAX_INSIGHTS_PER_CATEGORY]:
            if opening.games_count >= MIN_GAMES_FOR_INSIGHT:
                winrate_pct = int(opening.winrate * 100)

                insights.append(RepertoireInsight(
                    type="suggestion",
                    message=f"Consider playing more {opening.opening_name} ({opening.eco_code}) as {color} - "
                           f"{winrate_pct}% winrate in {opening.games_count} games",
                    opening_eco=opening.eco_code,
                    priority="medium"
                ))

    # Core strengths - medium priority
    core_group = repertoire.get("core", RepertoireGroup(category="core", description="", openings=[], total_games=0, avg_winrate=0.0))
    if core_group.openings:
        # Find the strongest core opening
        best_core = max(core_group.openings, key=lambda x: x.winrate)
        if best_core.games_count >= MIN_GAMES_FOR_INSIGHT:
            winrate_pct = int(best_core.winrate * 100)
            frequency_pct = int(best_core.frequency * 100)

            insights.append(RepertoireInsight(
                type="strength",
                message=f"Your {best_core.opening_name} ({best_core.eco_code}) as {color} is solid - "
                       f"{best_core.games_count} games with {winrate_pct}% winrate ({frequency_pct}% of games)",
                opening_eco=best_core.eco_code,
                priority="medium"
            ))

    # Experimental concerns - low priority
    experimental_group = repertoire.get("experimental", RepertoireGroup(category="experimental", description="", openings=[], total_games=0, avg_winrate=0.0))
    if experimental_group.openings:
        # Sort by games count (most played experiments first)
        experiment_openings = sorted(experimental_group.openings, key=lambda x: x.games_count, reverse=True)

        for opening in experiment_openings[:2]:  # Limit to top 2 experimental concerns
            if opening.games_count >= MIN_GAMES_FOR_INSIGHT:
                winrate_pct = int(opening.winrate * 100)

                insights.append(RepertoireInsight(
                    type="suggestion",
                    message=f"Consider dropping {opening.opening_name} ({opening.eco_code}) as {color} - "
                           f"only {winrate_pct}% winrate in {opening.games_count} games",
                    opening_eco=opening.eco_code,
                    priority="low"
                ))

    # Overall color performance insight
    color_games = sum(group.total_games for group in repertoire.values())
    if color_games >= 10:  # Only if sufficient games
        color_winrate = sum(
            group.avg_winrate * group.total_games
            for group in repertoire.values()
            if group.total_games > 0
        ) / color_games if color_games > 0 else 0.0

        winrate_pct = int(color_winrate * 100)
        games_pct = int((color_games / total_games * 100)) if total_games > 0 else 0

        performance_type = "strength" if color_winrate >= 0.55 else "warning" if color_winrate < 0.45 else "suggestion"
        priority = "medium" if performance_type == "warning" else "low"

        insights.append(RepertoireInsight(
            type=performance_type,
            message=f"Overall {color} performance: {winrate_pct}% winrate across {color_games} games ({games_pct}% of total)",
            opening_eco=None,
            priority=priority
        ))

    return insights


def filter_empty_categories(repertoire: Dict[str, RepertoireGroup]) -> Dict[str, RepertoireGroup]:
    """
    Remove empty categories from repertoire to clean up the response.

    Args:
        repertoire: Dictionary of repertoire groups

    Returns:
        Filtered dictionary with only non-empty groups
    """
    return {
        category: group
        for category, group in repertoire.items()
        if group.openings  # Only include categories with openings
    }