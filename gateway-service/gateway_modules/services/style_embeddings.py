"""
Style Embeddings Service.

Generates player style embeddings from aggregate playing statistics.
Uses a proxy embedding when pre-trained embeddings are unavailable.

This is Step 7 of the ML pipeline augmentation.

Feature flag: ml_config.style_embeddings
"""

from typing import Dict, List, Any, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass, field
import math

if TYPE_CHECKING:
    from ..config.ml_config import MLConfig


# Style dimension definitions
STYLE_DIMENSIONS = [
    "aggression",      # Attack frequency, forward piece placement
    "complexity",      # Position complexity preference
    "endgame_skill",   # Endgame conversion rate
    "opening_depth",   # Opening preparation depth
    "time_pressure",   # Performance under time pressure
    "tactical_sharpness",  # Tactical complexity preference
    "positional_play",     # Positional vs tactical balance
    "risk_tolerance",      # Willingness to accept imbalanced positions
]


@dataclass
class StyleVector:
    """Player style embedding vector."""
    
    vector: List[float] = field(default_factory=lambda: [0.5] * len(STYLE_DIMENSIONS))
    dimensions: List[str] = field(default_factory=lambda: STYLE_DIMENSIONS.copy())
    
    def __getitem__(self, key: str) -> float:
        """Get dimension value by name."""
        if key in self.dimensions:
            idx = self.dimensions.index(key)
            return self.vector[idx]
        return 0.5
    
    def to_dict(self) -> Dict[str, float]:
        """Convert to dimension -> value dict."""
        return dict(zip(self.dimensions, self.vector))
    
    def normalize(self) -> "StyleVector":
        """Normalize to unit length."""
        magnitude = math.sqrt(sum(v ** 2 for v in self.vector))
        if magnitude == 0:
            return self
        return StyleVector(
            vector=[v / magnitude for v in self.vector],
            dimensions=self.dimensions.copy(),
        )


def compute_style_embedding(
    player_stats: Dict[str, Any],
    ml_config: Optional["MLConfig"] = None,
) -> StyleVector:
    """
    Compute style embedding from player statistics.
    
    This is a proxy embedding that extracts style dimensions from
    aggregate statistics. Can be replaced with pre-trained model.
    
    Args:
        player_stats: Dict with player aggregate statistics
        ml_config: Optional ML configuration
        
    Returns:
        StyleVector with normalized style dimensions
    """
    vector = [0.5] * len(STYLE_DIMENSIONS)
    
    # Extract dimensions from stats
    
    # Aggression: based on attack patterns and forward piece placement
    avg_eval_swing = player_stats.get("avg_eval_swing", 0)
    vector[0] = min(1.0, 0.5 + (avg_eval_swing / 200))  # More swings = more aggressive
    
    # Complexity: based on game length and position types
    avg_game_length = player_stats.get("avg_game_length", 40)
    vector[1] = min(1.0, avg_game_length / 60)  # Longer games = more complex
    
    # Endgame skill: endgame conversion rate
    endgame_winrate = player_stats.get("endgame_winrate", 0.5)
    vector[2] = endgame_winrate
    
    # Opening depth: book moves played, opening accuracy
    opening_accuracy = player_stats.get("opening_accuracy", 0.5)
    vector[3] = opening_accuracy
    
    # Time pressure: performance under time pressure
    time_pressure_score = player_stats.get("time_pressure_score", 0.5)
    vector[4] = time_pressure_score
    
    # Tactical sharpness: based on tactical puzzle performance
    tactics_score = player_stats.get("tactics_rating_percentile", 0.5)
    vector[5] = tactics_score
    
    # Positional play: inverse of tactical sharpness weighted with accuracy
    accuracy = player_stats.get("avg_accuracy", 0.5)
    vector[6] = accuracy * (1 - vector[5] * 0.3)  # Higher accuracy, less tactical = positional
    
    # Risk tolerance: variance in eval positions
    eval_variance = player_stats.get("eval_variance", 0)
    vector[7] = min(1.0, 0.5 + (eval_variance / 10000))
    
    return StyleVector(vector=vector, dimensions=STYLE_DIMENSIONS.copy())


def cosine_similarity(a: StyleVector, b: StyleVector) -> float:
    """
    Compute cosine similarity between two style vectors.
    
    Args:
        a: First style vector
        b: Second style vector
        
    Returns:
        Cosine similarity in [-1, 1]
    """
    dot_product = sum(x * y for x, y in zip(a.vector, b.vector))
    magnitude_a = math.sqrt(sum(x ** 2 for x in a.vector))
    magnitude_b = math.sqrt(sum(y ** 2 for y in b.vector))
    
    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0
    
    return dot_product / (magnitude_a * magnitude_b)


def find_similar_style(
    player_style: StyleVector,
    reference_styles: Dict[str, StyleVector],
    top_k: int = 3,
) -> List[Tuple[str, float]]:
    """
    Find most similar reference styles.
    
    Args:
        player_style: Player's style vector
        reference_styles: Dict mapping name to StyleVector
        top_k: Number of top matches to return
        
    Returns:
        List of (name, similarity) tuples sorted by similarity
    """
    similarities = []
    
    for name, ref_style in reference_styles.items():
        sim = cosine_similarity(player_style, ref_style)
        similarities.append((name, sim))
    
    # Sort by similarity descending
    similarities.sort(key=lambda x: x[1], reverse=True)
    
    return similarities[:top_k]


# =============================================================================
# Style Entropy & Consistency (Phase 3)
# =============================================================================

def style_probs(similarities: List[float], tau: float = 0.7) -> List[float]:
    """
    Convert archetype similarities to probabilities via softmax with temperature.
    
    Args:
        similarities: List of similarity scores
        tau: Temperature parameter (lower = more peaked, higher = more uniform)
             Default 0.7 gives reasonable differentiation.
        
    Returns:
        List of probabilities that sum to 1.0
    """
    if not similarities or tau <= 0:
        return []
    
    # Softmax with temperature
    exps = [math.exp(s / tau) for s in similarities]
    total = sum(exps)
    
    if total == 0:
        return [1.0 / len(similarities)] * len(similarities)
    
    return [e / total for e in exps]


def compute_style_entropy(similarities: List[float], tau: float = 0.7) -> Tuple[float, float]:
    """
    Compute style entropy from archetype similarities.
    
    Style entropy measures how "mixed" or "specialized" a player's style is.
    
    Args:
        similarities: List of similarity scores to archetypes
        tau: Temperature parameter for softmax
        
    Returns:
        Tuple of (raw_entropy, normalized_entropy)
        normalized_entropy is in [0, 1] where:
            < 0.30: Strong specialist
            0.30-0.55: Hybrid
            0.55-0.75: Universal
            > 0.75: Experimental/unstable
    """
    if not similarities or len(similarities) < 2:
        return 0.0, 0.0
    
    probs = style_probs(similarities, tau)
    
    # Compute Shannon entropy: H = -Σ p_i * log2(p_i)
    entropy = 0.0
    for p in probs:
        if p > 0:
            entropy -= p * math.log2(p)
    
    # Normalize by maximum possible entropy (uniform distribution)
    max_entropy = math.log2(len(probs))
    normalized = entropy / max_entropy if max_entropy > 0 else 0.0
    
    return entropy, normalized


def interpret_entropy(entropy_norm: float) -> Tuple[str, str]:
    """
    Interpret normalized style entropy.
    
    Args:
        entropy_norm: Normalized entropy in [0, 1]
        
    Returns:
        Tuple of (category, description)
    """
    if entropy_norm < 0.30:
        return "specialist", "Strong specialist with a focused playing style"
    elif entropy_norm < 0.55:
        return "hybrid", "Hybrid style combining 2-3 archetypes"
    elif entropy_norm < 0.75:
        return "universal", "Universal player comfortable with many styles"
    else:
        return "experimental", "Experimental/variable style (or still developing)"


# Pre-defined archetypal styles (can be extended with real pro player data)
ARCHETYPE_STYLES = {
    "tactical_attacker": StyleVector(
        vector=[0.8, 0.7, 0.5, 0.6, 0.6, 0.9, 0.3, 0.7],
        dimensions=STYLE_DIMENSIONS.copy(),
    ),
    "solid_defender": StyleVector(
        vector=[0.3, 0.5, 0.7, 0.7, 0.5, 0.4, 0.8, 0.3],
        dimensions=STYLE_DIMENSIONS.copy(),
    ),
    "universal_player": StyleVector(
        vector=[0.5, 0.6, 0.6, 0.7, 0.6, 0.5, 0.6, 0.5],
        dimensions=STYLE_DIMENSIONS.copy(),
    ),
    "endgame_specialist": StyleVector(
        vector=[0.4, 0.6, 0.9, 0.5, 0.6, 0.4, 0.7, 0.4],
        dimensions=STYLE_DIMENSIONS.copy(),
    ),
    "opening_expert": StyleVector(
        vector=[0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.6, 0.5],
        dimensions=STYLE_DIMENSIONS.copy(),
    ),
    "risk_taker": StyleVector(
        vector=[0.7, 0.8, 0.4, 0.5, 0.4, 0.7, 0.4, 0.9],
        dimensions=STYLE_DIMENSIONS.copy(),
    ),
}


def analyze_player_style(
    player_stats: Dict[str, Any],
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Any]:
    """
    Full style analysis pipeline.
    
    Args:
        player_stats: Dict with player aggregate statistics
        ml_config: Optional ML configuration
        
    Returns:
        Dict with style_vector, archetype_matches, entropy, and style_summary
    """
    # Compute embedding
    style = compute_style_embedding(player_stats, ml_config)
    
    # Find similar archetypes (get all for entropy calculation)
    all_matches = find_similar_style(style, ARCHETYPE_STYLES, top_k=len(ARCHETYPE_STYLES))
    top_matches = all_matches[:3]
    
    # Compute style entropy
    all_similarities = [sim for _, sim in all_matches]
    raw_entropy, normalized_entropy = compute_style_entropy(all_similarities)
    entropy_category, entropy_description = interpret_entropy(normalized_entropy)
    
    # Get top dimension (strongest trait)
    style_dict = style.to_dict()
    top_dimension = max(style_dict.items(), key=lambda x: x[1])
    
    # Generate summary with entropy
    if top_matches:
        primary_match = top_matches[0]
        summary = (
            f"Your style most resembles a {primary_match[0].replace('_', ' ')} "
            f"({primary_match[1]:.0%} similarity). "
            f"You are a {entropy_category} with {normalized_entropy:.0%} style diversity. "
            f"Your strongest trait is {top_dimension[0].replace('_', ' ')} ({top_dimension[1]:.0%})."
        )
    else:
        summary = f"Your strongest trait is {top_dimension[0].replace('_', ' ')} ({top_dimension[1]:.0%})."
    
    return {
        "style_vector": style.vector,
        "style_dimensions": style.dimensions,
        "style_dict": style_dict,
        "archetype_matches": [
            {"archetype": name, "similarity": round(sim, 3)}
            for name, sim in top_matches
        ],
        "primary_archetype": top_matches[0][0] if top_matches else None,
        "top_dimension": top_dimension[0],
        # New entropy fields (Phase 3)
        "style_entropy": round(normalized_entropy, 3),
        "style_entropy_raw": round(raw_entropy, 3),
        "style_consistency": entropy_category,
        "style_consistency_description": entropy_description,
        "style_summary": summary,
    }


def enrich_report_with_style(
    report: Dict[str, Any],
    player_stats: Dict[str, Any],
    ml_config: Optional["MLConfig"] = None,
) -> Dict[str, Any]:
    """
    Add style embedding analysis to report.
    
    Args:
        report: Report dict to enrich
        player_stats: Player aggregate statistics
        ml_config: Optional ML configuration
        
    Returns:
        Report with style_analysis field added
    """
    style_analysis = analyze_player_style(player_stats, ml_config)
    report["style_analysis"] = style_analysis
    return report
