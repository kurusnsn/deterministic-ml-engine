"""
Style-Based Repertoire Builder Service

Suggests openings that match the user's computed playstyle.
Uses ECO style tags to find openings that align with user preferences.

This service does NOT use external APIs or additional Stockfish analysis.
It leverages the existing ECO_STYLE_TAGS mapping to match openings to styles.
"""

from typing import List, Optional, Dict, Any, Literal
from dataclasses import dataclass
import math

from .opening_style_config import ECO_STYLE_TAGS, get_style_tags
from ..models.repertoire import StyleScore, PlaystyleProfile


@dataclass
class OpeningSuggestion:
    """A suggested opening for the user's repertoire."""
    eco: str
    name: str
    color: Literal["white", "black"]
    match_score: float  # 0-1, how well it matches user's style
    tags: List[str]
    reason: str  # Why this opening is suggested


# Opening names for ECO codes (subset of common openings)
ECO_OPENING_NAMES: Dict[str, str] = {
    # Sicilian variations
    "B20": "Sicilian Defense",
    "B21": "Sicilian Defense: Grand Prix Attack",
    "B22": "Sicilian Defense: Alapin Variation",
    "B30": "Sicilian Defense: Rossolimo Variation",
    "B33": "Sicilian Defense: Sveshnikov Variation",
    "B70": "Sicilian Defense: Dragon Variation",
    "B90": "Sicilian Defense: Najdorf Variation",
    "B97": "Sicilian Defense: Najdorf, Poisoned Pawn",
    
    # French variations
    "C00": "French Defense",
    "C02": "French Defense: Advance Variation",
    "C10": "French Defense: Rubinstein Variation",
    "C15": "French Defense: Winawer Variation",
    
    # Caro-Kann
    "B10": "Caro-Kann Defense",
    "B12": "Caro-Kann Defense: Advance Variation",
    "B18": "Caro-Kann Defense: Classical Variation",
    
    # King's Gambit
    "C30": "King's Gambit",
    "C33": "King's Gambit Accepted",
    "C37": "King's Gambit: Muzio Gambit",
    
    # Italian/Two Knights
    "C50": "Italian Game",
    "C51": "Evans Gambit",
    "C54": "Italian Game: Giuoco Piano",
    "C57": "Two Knights Defense: Traxler Counterattack",
    
    # Ruy Lopez
    "C60": "Ruy Lopez",
    "C65": "Ruy Lopez: Berlin Defense",
    "C67": "Ruy Lopez: Berlin Defense, Rio Gambit Accepted",
    "C89": "Ruy Lopez: Marshall Attack",
    "C92": "Ruy Lopez: Closed, Classical Defense",
    
    # Scotch
    "C44": "Scotch Game",
    "C45": "Scotch Game: Classical Variation",
    
    # Petroff
    "C42": "Petroff Defense",
    "C43": "Petroff Defense: Modern Attack",
    
    # Queen's Gambit
    "D20": "Queen's Gambit Accepted",
    "D30": "Queen's Gambit Declined",
    "D37": "Queen's Gambit Declined: Classical Variation",
    "D44": "Semi-Slav Defense: Botvinnik System",
    "D52": "Queen's Gambit Declined: Cambridge Springs",
    
    # Slav
    "D10": "Slav Defense",
    "D13": "Slav Defense: Exchange Variation",
    
    # Grünfeld
    "D70": "Grünfeld Defense",
    "D85": "Grünfeld Defense: Exchange Variation",
    "D97": "Grünfeld Defense: Russian System",
    
    # King's Indian
    "E60": "King's Indian Defense",
    "E62": "King's Indian Defense: Fianchetto Variation",
    "E76": "King's Indian Defense: Four Pawns Attack",
    "E92": "King's Indian Defense: Classical Variation",
    "E97": "King's Indian Defense: Mar del Plata Variation",
    
    # Nimzo-Indian
    "E20": "Nimzo-Indian Defense",
    "E32": "Nimzo-Indian Defense: Classical Variation",
    "E46": "Nimzo-Indian Defense: Rubinstein Variation",

    # Queen's Indian
    "E12": "Queen's Indian Defense",
    "E15": "Queen's Indian Defense: Classical Variation",
    
    # Catalan
    "E00": "Catalan Opening",
    "E04": "Catalan Opening: Open Defense",
    
    # English
    "A10": "English Opening",
    "A16": "English Opening: Anglo-Indian Defense",
    
    # Dutch
    "A80": "Dutch Defense",
    "A87": "Dutch Defense: Leningrad Variation",
    "A93": "Dutch Defense: Stonewall Variation",
    
    # London System
    "D00": "London System",
    "A48": "London System",
}


def suggest_openings_for_style(
    style: StyleScore,
    color: Literal["white", "black"],
    existing_ecos: Optional[List[str]] = None,
    limit: int = 5
) -> List[OpeningSuggestion]:
    """
    Suggest openings that match the user's playstyle.
    
    Args:
        style: The user's StyleScore for the given color
        color: Which color to suggest openings for
        existing_ecos: ECO codes already in the user's repertoire (to avoid duplicates)
        limit: Maximum number of suggestions to return
        
    Returns:
        List of OpeningSuggestion objects sorted by match score
    """
    existing = set(existing_ecos or [])
    suggestions: List[OpeningSuggestion] = []
    
    # Build user style vector
    user_vector = [
        style.tactical,
        style.positional,
        style.aggressive,
        style.defensive,
        style.open_positions,
        style.closed_positions,
    ]
    
    # Filter openings by color appropriateness
    # For white: prioritize openings that start with A, B, C (1.e4/1.d4), D (1.d4)
    # For black: all ECO codes work as black responses
    
    for eco, tags in ECO_STYLE_TAGS.items():
        # Skip if already in repertoire
        if eco in existing:
            continue
        
        # Get opening name
        opening_name = ECO_OPENING_NAMES.get(eco)
        if not opening_name:
            # Skip ECO codes without known names
            continue
        
        # Build opening style vector
        opening_vector = [
            1.0 if "tactical" in tags else 0.0,
            1.0 if "positional" in tags else 0.0,
            1.0 if "aggressive" in tags else 0.0,
            1.0 if "defensive" in tags else 0.0,
            1.0 if "open" in tags else 0.0,
            1.0 if "closed" in tags else 0.0,
        ]
        
        # Compute cosine similarity
        match_score = _cosine_similarity(user_vector, opening_vector)
        
        # Generate reason based on matching tags
        matching_tags = []
        if style.tactical > 0.5 and "tactical" in tags:
            matching_tags.append("tactical")
        if style.positional > 0.5 and "positional" in tags:
            matching_tags.append("positional")
        if style.aggressive > 0.5 and "aggressive" in tags:
            matching_tags.append("aggressive")
        if style.defensive > 0.5 and "defensive" in tags:
            matching_tags.append("defensive")
        if style.open_positions > 0.5 and "open" in tags:
            matching_tags.append("open positions")
        if style.closed_positions > 0.5 and "closed" in tags:
            matching_tags.append("closed positions")
        
        if matching_tags:
            reason = f"Matches your {', '.join(matching_tags)} style"
        else:
            reason = "May complement your existing repertoire"
        
        suggestions.append(OpeningSuggestion(
            eco=eco,
            name=opening_name,
            color=color,
            match_score=match_score,
            tags=tags,
            reason=reason
        ))
    
    # Sort by match score and return top N
    suggestions.sort(key=lambda x: x.match_score, reverse=True)
    return suggestions[:limit]


def generate_repertoire_suggestions(
    profile: PlaystyleProfile,
    existing_white_ecos: Optional[List[str]] = None,
    existing_black_ecos: Optional[List[str]] = None,
    suggestions_per_color: int = 3
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Generate complete repertoire suggestions based on playstyle profile.
    
    Args:
        profile: The user's PlaystyleProfile
        existing_white_ecos: ECO codes in user's white repertoire
        existing_black_ecos: ECO codes in user's black repertoire
        suggestions_per_color: Number of suggestions per color
        
    Returns:
        Dict with 'white' and 'black' keys containing suggestion lists
    """
    white_suggestions = suggest_openings_for_style(
        style=profile.white,
        color="white",
        existing_ecos=existing_white_ecos,
        limit=suggestions_per_color
    )
    
    black_suggestions = suggest_openings_for_style(
        style=profile.black,
        color="black",
        existing_ecos=existing_black_ecos,
        limit=suggestions_per_color
    )
    
    return {
        "white": [
            {
                "eco": s.eco,
                "name": s.name,
                "color": s.color,
                "match_score": round(s.match_score, 3),
                "tags": s.tags,
                "reason": s.reason
            }
            for s in white_suggestions
        ],
        "black": [
            {
                "eco": s.eco,
                "name": s.name,
                "color": s.color,
                "match_score": round(s.match_score, 3),
                "tags": s.tags,
                "reason": s.reason
            }
            for s in black_suggestions
        ]
    }


def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(b * b for b in vec2))
    
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.5
    
    return dot_product / (magnitude1 * magnitude2)
