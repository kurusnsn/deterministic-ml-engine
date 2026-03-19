"""
ECO Mappings for chess openings.

Provides a lightweight lookup for common chess openings by ECO code.
Used for generating opening-aware commentary.
"""

from typing import Dict, Optional, TypedDict


class EcoInfo(TypedDict, total=False):
    """Information about a chess opening."""
    name: str
    short_label: str
    plan_white: str
    plan_black: str
    style_tags: list


# Major openings with ECO codes
ECO_MAPPINGS: Dict[str, EcoInfo] = {
    # Open Games (1.e4 e5)
    "C50": {
        "name": "Italian Game",
        "short_label": "Italian",
        "plan_white": "Control the center with d3-d4, develop pieces harmoniously",
        "plan_black": "Counter in the center with d6-d5 or counterattack c6-d5",
        "style_tags": ["classical", "positional", "tactical"]
    },
    "C60": {
        "name": "Ruy Lopez",
        "short_label": "Ruy Lopez",
        "plan_white": "Build pressure on e5, expand with d4 and c3",
        "plan_black": "Defend e5, counterattack with a6-b5 or d6-d5",
        "style_tags": ["classical", "strategic", "slow buildup"]
    },
    "C65": {
        "name": "Ruy Lopez: Berlin Defense",
        "short_label": "Berlin",
        "plan_white": "Trade into Berlin endgame or avoid with d3",
        "plan_black": "Simplify to a drawish endgame with solid structure",
        "style_tags": ["solid", "endgame-focused", "drawish"]
    },
    "C42": {
        "name": "Petrov Defense",
        "short_label": "Petrov",
        "plan_white": "Central control with d4, active piece play",
        "plan_black": "Solid defense, equal counterplay",
        "style_tags": ["solid", "symmetrical", "classical"]
    },
    "C21": {
        "name": "Center Game",
        "short_label": "Center Game",
        "plan_white": "Quick development, aggressive play",
        "plan_black": "Counterattack in the center",
        "style_tags": ["aggressive", "tactical", "gambit"]
    },
    "C44": {
        "name": "Scotch Game",
        "short_label": "Scotch",
        "plan_white": "Open center, active piece play",
        "plan_black": "Develop quickly, target d4 pawn",
        "style_tags": ["open", "aggressive", "tactical"]
    },

    # Sicilian Defense (1.e4 c5)
    "B20": {
        "name": "Sicilian Defense",
        "short_label": "Sicilian",
        "plan_white": "f4-f5 kingside attack or positional d3 systems",
        "plan_black": "Counterplay on the queenside with a6-b5",
        "style_tags": ["aggressive", "asymmetrical", "complex"]
    },
    "B23": {
        "name": "Sicilian: Closed Variation",
        "short_label": "Closed Sicilian",
        "plan_white": "Kingside expansion with f4-g4",
        "plan_black": "Queenside expansion with a6-b5-b4",
        "style_tags": ["slow", "strategic", "closed"]
    },
    "B30": {
        "name": "Sicilian: Rossolimo Variation",
        "short_label": "Rossolimo",
        "plan_white": "Early Bb5 to double pawns, control d5",
        "plan_black": "Solid development, break with d5",
        "style_tags": ["positional", "anti-Sicilian", "solid"]
    },
    "B50": {
        "name": "Sicilian: Modern Variations",
        "short_label": "Sicilian Modern",
        "plan_white": "Open Sicilian with d4 or Anti-Sicilian systems",
        "plan_black": "Dynamic counterplay depending on variation",
        "style_tags": ["complex", "theoretical", "dynamic"]
    },
    "B90": {
        "name": "Sicilian: Najdorf Variation",
        "short_label": "Najdorf",
        "plan_white": "English Attack f3-Be3-Qd2 or classical Be2",
        "plan_black": "b5-b4 expansion, e5 break when possible",
        "style_tags": ["sharp", "theoretical", "dynamic"]
    },

    # French Defense (1.e4 e6)
    "C00": {
        "name": "French Defense",
        "short_label": "French",
        "plan_white": "Space advantage with e5, kingside attack",
        "plan_black": "Undermine center with c5 and f6",
        "style_tags": ["solid", "strategic", "counterattacking"]
    },
    "C01": {
        "name": "French Defense: Exchange Variation",
        "short_label": "French Exchange",
        "plan_white": "Symmetrical structure, piece play",
        "plan_black": "Active bishops, quick development",
        "style_tags": ["symmetrical", "solid", "simple"]
    },
    "C02": {
        "name": "French Defense: Advance Variation",
        "short_label": "French Advance",
        "plan_white": "Maintain e5 chain, kingside attack",
        "plan_black": "Attack the chain with c5, f6",
        "style_tags": ["closed", "strategic", "pawn structure"]
    },

    # Caro-Kann Defense (1.e4 c6)
    "B10": {
        "name": "Caro-Kann Defense",
        "short_label": "Caro-Kann",
        "plan_white": "Central control, piece activity",
        "plan_black": "Solid structure, light-squared bishop outside chain",
        "style_tags": ["solid", "reliable", "strategic"]
    },
    "B12": {
        "name": "Caro-Kann: Advance Variation",
        "short_label": "Caro-Kann Advance",
        "plan_white": "Space advantage, kingside expansion",
        "plan_black": "Undermine with c5 and Bf5 development",
        "style_tags": ["closed", "strategic", "positional"]
    },

    # Queen's Gambit (1.d4 d5 2.c4)
    "D00": {
        "name": "Queen's Pawn Game",
        "short_label": "d4 systems",
        "plan_white": "Central control, slow buildup",
        "plan_black": "Solid development, counterplay in center",
        "style_tags": ["classical", "strategic", "positional"]
    },
    "D30": {
        "name": "Queen's Gambit Declined",
        "short_label": "QGD",
        "plan_white": "Minority attack on queenside, pressure on d5",
        "plan_black": "Solid defense, freeing moves e5 or c5",
        "style_tags": ["classical", "solid", "strategic"]
    },
    "D35": {
        "name": "Queen's Gambit Declined: Exchange Variation",
        "short_label": "QGD Exchange",
        "plan_white": "Minority attack, isolated queen pawn positions",
        "plan_black": "Active piece play, kingside counterplay",
        "style_tags": ["classical", "strategic", "minority attack"]
    },
    "D06": {
        "name": "Queen's Gambit",
        "short_label": "Queen's Gambit",
        "plan_white": "Central control, develop pieces actively",
        "plan_black": "Accept gambit or decline solidly",
        "style_tags": ["classical", "mainline", "strategic"]
    },

    # Indian Defenses (1.d4 Nf6)
    "E60": {
        "name": "King's Indian Defense",
        "short_label": "KID",
        "plan_white": "Queenside expansion, control the center",
        "plan_black": "Kingside attack with f5-f4 or e5",
        "style_tags": ["hypermodern", "dynamic", "attacking"]
    },
    "E70": {
        "name": "King's Indian: Classical Variation",
        "short_label": "KID Classical",
        "plan_white": "Central control with e4-d5",
        "plan_black": "f5 break, kingside attack",
        "style_tags": ["complex", "dynamic", "theoretical"]
    },
    "E20": {
        "name": "Nimzo-Indian Defense",
        "short_label": "Nimzo-Indian",
        "plan_white": "Central control with e3-d4",
        "plan_black": "Control e4, doubled c-pawns pressure",
        "style_tags": ["positional", "strategic", "flexible"]
    },
    "E10": {
        "name": "Queen's Pawn: Indian Systems",
        "short_label": "Indian Defense",
        "plan_white": "Flexible central control",
        "plan_black": "Hypermodern control from distance",
        "style_tags": ["hypermodern", "flexible", "strategic"]
    },

    # English Opening (1.c4)
    "A10": {
        "name": "English Opening",
        "short_label": "English",
        "plan_white": "Fianchetto, control d5, flexible center",
        "plan_black": "Symmetrical or reversed Sicilian setups",
        "style_tags": ["flexible", "hypermodern", "strategic"]
    },
    "A20": {
        "name": "English: Reversed Sicilian",
        "short_label": "English Reversed",
        "plan_white": "Control d5, fianchetto kingside",
        "plan_black": "Central counterplay with d5",
        "style_tags": ["hypermodern", "flexible", "positional"]
    },

    # Flank Openings
    "A00": {
        "name": "Uncommon Opening",
        "short_label": "Unusual",
        "plan_white": "Various unorthodox ideas",
        "plan_black": "Central control, development",
        "style_tags": ["unusual", "surprise", "offbeat"]
    },
    "A04": {
        "name": "Réti Opening",
        "short_label": "Réti",
        "plan_white": "Hypermodern control, fianchetto both bishops",
        "plan_black": "Occupy center with pawns",
        "style_tags": ["hypermodern", "flexible", "strategic"]
    },

    # London System
    "D02": {
        "name": "London System",
        "short_label": "London",
        "plan_white": "Solid development, pyramid structure",
        "plan_black": "Challenge the center, break with c5 or e5",
        "style_tags": ["solid", "system", "positional"]
    },
}


def lookup_eco_info(eco_code: str) -> Optional[EcoInfo]:
    """
    Look up opening information by ECO code.
    
    Args:
        eco_code: ECO code like "C50", "B90"
        
    Returns:
        EcoInfo dict if found, None otherwise
    """
    if not eco_code:
        return None
    
    # Normalize to uppercase
    eco_code = eco_code.upper().strip()
    
    # Direct lookup
    if eco_code in ECO_MAPPINGS:
        return ECO_MAPPINGS[eco_code]
    
    # Try base code (e.g., "C50" from "C50.1")
    base_code = eco_code.split(".")[0][:3]
    if base_code in ECO_MAPPINGS:
        return ECO_MAPPINGS[base_code]
    
    # Try category match (e.g., "C5" for any C50-C59)
    if len(eco_code) >= 2:
        category = eco_code[:2]
        for code, info in ECO_MAPPINGS.items():
            if code.startswith(category):
                return info
    
    return None


def get_opening_name(eco_code: str) -> Optional[str]:
    """
    Get the opening name for an ECO code.
    
    Args:
        eco_code: ECO code like "C50"
        
    Returns:
        Opening name if found, None otherwise
    """
    info = lookup_eco_info(eco_code)
    return info.get("name") if info else None
