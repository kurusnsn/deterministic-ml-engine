"""
Configuration constants for chess opening repertoire analysis.

These thresholds are used to classify openings into different categories
and can be easily adjusted to fine-tune the analysis.
"""

# Frequency thresholds (as percentage of total games)
# Lowered to work better with smaller game counts
HIGH_FREQUENCY_THRESHOLD = 0.05  # 5% - openings played frequently (e.g., 5+ games out of 100)
LOW_FREQUENCY_THRESHOLD = 0.02   # 2% - openings played rarely

# Winrate thresholds
SOLID_WINRATE_THRESHOLD = 0.50   # 50% - acceptable performance
POOR_WINRATE_THRESHOLD = 0.40    # 40% - poor performance that needs work
HIGH_WINRATE_THRESHOLD = 0.60    # 60% - excellent performance

# Minimum games threshold
MIN_GAMES_FOR_ANALYSIS = 1       # Minimum games needed to include an opening in analysis

# Category definitions and descriptions
REPERTOIRE_CATEGORIES = {
    "core": {
        "name": "Core Openings",
        "description": "Your main weapons - played frequently with solid results. Study these deeply.",
        "criteria": "Frequency (≥2%) + solid winrate (≥50%)"
    },
    "repair": {
        "name": "Problem Areas",
        "description": "Frequently played but struggling. These need immediate attention.",
        "criteria": "Frequency (≥2%) + poor winrate (<40%)"
    },
    "expansion": {
        "name": "Hidden Gems",
        "description": "Rarely played but successful. Consider expanding usage.",
        "criteria": "Low frequency (<2%) + high winrate (≥60%)"
    },
    "experimental": {
        "name": "Experiments",
        "description": "Infrequent and unsuccessful. Consider dropping or improving.",
        "criteria": "Low frequency (<2%) + poor winrate (<40%)"
    },
    "developing": {
        "name": "Developing",
        "description": "Openings with mixed results or moderate usage. Keep working on these.",
        "criteria": "Any frequency with winrate 40-60%"
    }
}

# Time analysis settings
TIME_ANALYSIS_ENABLED = True     # Whether to include time usage analysis
MIN_TIME_DATA_GAMES = 5          # Minimum games with time data for time analysis

# Insight generation settings
MAX_INSIGHTS_PER_CATEGORY = 3    # Maximum insights to generate per category
MIN_GAMES_FOR_INSIGHT = 5        # Minimum games to generate specific insights

# Color-specific adjustments
WHITE_WINRATE_EXPECTATION = 0.52  # Slightly higher expectation for white due to first move advantage
BLACK_WINRATE_EXPECTATION = 0.48  # Slightly lower expectation for black

def get_adjusted_winrate_thresholds(color: str) -> dict:
    """
    Get winrate thresholds adjusted for color expectations.

    Args:
        color: "white" or "black"

    Returns:
        Dict with adjusted thresholds for the given color
    """
    base_adjustment = 0.02

    if color == "white":
        return {
            "solid": SOLID_WINRATE_THRESHOLD + base_adjustment,
            "poor": POOR_WINRATE_THRESHOLD + base_adjustment,
            "high": HIGH_WINRATE_THRESHOLD + base_adjustment
        }
    else:  # black
        return {
            "solid": SOLID_WINRATE_THRESHOLD - base_adjustment,
            "poor": POOR_WINRATE_THRESHOLD - base_adjustment,
            "high": HIGH_WINRATE_THRESHOLD - base_adjustment
        }


def classify_opening_category(frequency: float, winrate: float, color: str) -> str:
    """
    Classify an opening into a repertoire category based on frequency and winrate.

    Args:
        frequency: Frequency as percentage of total games (0.0 to 1.0)
        winrate: Winrate including draws (0.0 to 1.0)
        color: "white" or "black"

    Returns:
        Category name: "core", "repair", "expansion", "experimental", or "developing"
    """
    thresholds = get_adjusted_winrate_thresholds(color)

    # 1. Performance-based classification (First priority)
    
    # Excellent performance
    if winrate >= thresholds["high"]:
        if frequency >= LOW_FREQUENCY_THRESHOLD:
            return "core"
        else:
            return "expansion"
            
    # Solid performance
    if winrate >= thresholds["solid"]:
        if frequency >= LOW_FREQUENCY_THRESHOLD:
            return "core"
        else:
            return "expansion"

    # Poor performance
    if winrate < thresholds["poor"]:
        if frequency >= LOW_FREQUENCY_THRESHOLD:
            return "repair"
        else:
            return "experimental"
    
    # 2. Fallback (Mixed results)
    return "developing"


# Priority levels for insights
INSIGHT_PRIORITIES = {
    "repair": "high",      # Problem areas need immediate attention
    "core": "medium",      # Core openings are important but stable
    "expansion": "medium", # Hidden gems worth considering
    "experimental": "low", # Experiments are lowest priority
    "developing": "low"    # Developing openings are work in progress
}

MAX_INSIGHTS_PER_CATEGORY = 3
MIN_GAMES_FOR_INSIGHT = 5
