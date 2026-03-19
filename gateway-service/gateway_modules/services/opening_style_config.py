"""
ECO code to style tag mappings for playstyle analysis.

Each ECO code family is tagged with style characteristics:
- open/closed: Position structure preference
- tactical/positional: Play style
- aggressive/defensive: Risk tolerance

Unknown ECO codes default to neutral (no tags).
"""

from typing import Dict, List

# ECO style tags mapping
# Tags: "open", "closed", "tactical", "positional", "aggressive", "defensive"
ECO_STYLE_TAGS: Dict[str, List[str]] = {
    # ========================================
    # A: Flank Openings, English, etc.
    # ========================================
    # English Opening - generally positional
    "A10": ["positional"],
    "A11": ["positional"],
    "A12": ["positional"],
    "A13": ["positional"],
    "A14": ["positional"],
    "A15": ["positional"],
    "A16": ["positional"],
    "A17": ["positional"],
    "A18": ["positional"],
    "A19": ["positional"],
    # Reti Opening
    "A04": ["positional"],
    "A05": ["positional"],
    "A06": ["positional"],
    "A07": ["positional"],
    "A08": ["positional"],
    "A09": ["positional"],
    # Dutch Defense - aggressive, can be tactical
    "A80": ["aggressive", "tactical"],
    "A81": ["aggressive", "tactical"],
    "A82": ["aggressive", "tactical"],  # Staunton Gambit
    "A83": ["aggressive", "tactical"],
    "A84": ["closed", "positional"],  # Classical Dutch
    "A85": ["closed", "positional"],
    "A86": ["aggressive", "tactical"],  # Leningrad Dutch
    "A87": ["aggressive", "tactical"],
    "A88": ["aggressive", "tactical"],
    "A89": ["aggressive", "tactical"],
    "A90": ["closed", "positional"],  # Stonewall Dutch
    "A91": ["closed", "positional", "defensive"],
    "A92": ["closed", "positional"],
    "A93": ["closed", "positional", "defensive"],  # Stonewall
    "A94": ["closed", "positional", "defensive"],
    "A95": ["closed", "positional", "defensive"],
    "A96": ["closed", "positional"],
    "A97": ["closed", "positional"],
    "A98": ["closed", "positional"],
    "A99": ["closed", "positional"],

    # ========================================
    # B: Semi-Open Games (e4 not e5)
    # ========================================
    # Sicilian Defense - generally tactical and aggressive
    "B20": ["open", "tactical", "aggressive"],
    "B21": ["open", "tactical", "aggressive"],  # Grand Prix Attack
    "B22": ["open", "tactical", "aggressive"],  # Alapin
    "B23": ["open", "tactical", "aggressive"],  # Closed Sicilian
    "B24": ["closed", "tactical"],  # Closed Sicilian
    "B25": ["closed", "tactical"],
    "B26": ["closed", "tactical"],
    "B27": ["open", "tactical", "aggressive"],
    "B28": ["open", "tactical", "aggressive"],  # O'Kelly
    "B29": ["open", "tactical", "aggressive"],
    "B30": ["open", "tactical"],  # Rossolimo
    "B31": ["open", "tactical"],
    "B32": ["open", "tactical", "aggressive"],  # Löwenthal
    "B33": ["open", "tactical", "aggressive"],  # Sveshnikov
    "B34": ["open", "tactical", "aggressive"],  # Accelerated Dragon
    "B35": ["open", "tactical", "aggressive"],
    "B36": ["open", "tactical", "aggressive"],  # Maroczy Bind
    "B37": ["open", "tactical", "aggressive"],
    "B38": ["open", "tactical", "aggressive"],
    "B39": ["open", "tactical", "aggressive"],
    "B40": ["open", "tactical"],
    "B41": ["open", "tactical", "aggressive"],  # Kan
    "B42": ["open", "tactical", "aggressive"],
    "B43": ["open", "tactical", "aggressive"],
    "B44": ["open", "tactical", "aggressive"],  # Taimanov
    "B45": ["open", "tactical", "aggressive"],
    "B46": ["open", "tactical", "aggressive"],
    "B47": ["open", "tactical", "aggressive"],
    "B48": ["open", "tactical", "aggressive"],
    "B49": ["open", "tactical", "aggressive"],
    "B50": ["open", "tactical", "aggressive"],
    "B51": ["open", "tactical", "aggressive"],  # Moscow
    "B52": ["open", "tactical", "aggressive"],
    "B53": ["open", "tactical", "aggressive"],
    "B54": ["open", "tactical", "aggressive"],
    "B55": ["open", "tactical", "aggressive"],
    "B56": ["open", "tactical", "aggressive"],
    "B57": ["open", "tactical", "aggressive"],  # Sozin
    "B58": ["open", "tactical", "aggressive"],  # Classical
    "B59": ["open", "tactical", "aggressive"],
    "B60": ["open", "tactical", "aggressive"],  # Richter-Rauzer
    "B61": ["open", "tactical", "aggressive"],
    "B62": ["open", "tactical", "aggressive"],
    "B63": ["open", "tactical", "aggressive"],
    "B64": ["open", "tactical", "aggressive"],
    "B65": ["open", "tactical", "aggressive"],
    "B66": ["open", "tactical", "aggressive"],
    "B67": ["open", "tactical", "aggressive"],
    "B68": ["open", "tactical", "aggressive"],
    "B69": ["open", "tactical", "aggressive"],
    "B70": ["open", "tactical", "aggressive"],  # Dragon
    "B71": ["open", "tactical", "aggressive"],
    "B72": ["open", "tactical", "aggressive"],
    "B73": ["open", "tactical", "aggressive"],
    "B74": ["open", "tactical", "aggressive"],
    "B75": ["open", "tactical", "aggressive"],
    "B76": ["open", "tactical", "aggressive"],
    "B77": ["open", "tactical", "aggressive"],
    "B78": ["open", "tactical", "aggressive"],  # Yugoslav Attack
    "B79": ["open", "tactical", "aggressive"],
    "B80": ["open", "tactical", "aggressive"],  # Scheveningen
    "B81": ["open", "tactical", "aggressive"],
    "B82": ["open", "tactical", "aggressive"],
    "B83": ["open", "tactical", "aggressive"],
    "B84": ["open", "tactical", "aggressive"],
    "B85": ["open", "tactical", "aggressive"],
    "B86": ["open", "tactical", "aggressive"],  # Sozin
    "B87": ["open", "tactical", "aggressive"],
    "B88": ["open", "tactical", "aggressive"],
    "B89": ["open", "tactical", "aggressive"],
    "B90": ["open", "tactical", "aggressive"],  # Najdorf
    "B91": ["open", "tactical", "aggressive"],
    "B92": ["open", "tactical", "aggressive"],
    "B93": ["open", "tactical", "aggressive"],
    "B94": ["open", "tactical", "aggressive"],
    "B95": ["open", "tactical", "aggressive"],
    "B96": ["open", "tactical", "aggressive"],
    "B97": ["open", "tactical", "aggressive"],  # Poisoned Pawn
    "B98": ["open", "tactical", "aggressive"],
    "B99": ["open", "tactical", "aggressive"],

    # French Defense - closed, positional
    "C00": ["closed", "positional", "defensive"],
    "C01": ["closed", "positional", "defensive"],
    "C02": ["closed", "positional", "defensive"],  # Advance
    "C03": ["closed", "positional", "defensive"],  # Tarrasch
    "C04": ["closed", "positional", "defensive"],
    "C05": ["closed", "positional", "defensive"],
    "C06": ["closed", "positional", "defensive"],
    "C07": ["closed", "positional", "defensive"],
    "C08": ["closed", "positional", "defensive"],
    "C09": ["closed", "positional", "defensive"],
    "C10": ["closed", "positional"],  # Rubinstein
    "C11": ["closed", "positional"],  # Steinitz, Classical
    "C12": ["closed", "positional"],  # MacCutcheon
    "C13": ["closed", "positional"],
    "C14": ["closed", "positional"],  # Classical
    "C15": ["closed", "tactical"],  # Winawer
    "C16": ["closed", "tactical"],
    "C17": ["closed", "tactical"],
    "C18": ["closed", "tactical"],
    "C19": ["closed", "tactical"],

    # Caro-Kann - solid, positional, defensive
    "B10": ["closed", "positional", "defensive"],
    "B11": ["closed", "positional", "defensive"],
    "B12": ["closed", "positional", "defensive"],
    "B13": ["closed", "positional", "defensive"],  # Exchange
    "B14": ["closed", "positional", "defensive"],
    "B15": ["closed", "positional", "defensive"],
    "B16": ["closed", "positional", "defensive"],
    "B17": ["closed", "positional", "defensive"],
    "B18": ["closed", "positional", "defensive"],
    "B19": ["closed", "positional", "defensive"],

    # Scandinavian
    "B01": ["open", "tactical"],

    # Alekhine Defense
    "B02": ["open", "tactical", "aggressive"],
    "B03": ["open", "tactical", "aggressive"],
    "B04": ["open", "tactical", "aggressive"],
    "B05": ["open", "tactical", "aggressive"],

    # Pirc/Modern
    "B06": ["closed", "positional"],  # Modern
    "B07": ["closed", "positional"],  # Pirc
    "B08": ["closed", "positional"],
    "B09": ["open", "tactical", "aggressive"],  # Austrian Attack

    # ========================================
    # C: Open Games (e4 e5)
    # ========================================
    # King's Gambit - very aggressive, tactical
    "C30": ["open", "tactical", "aggressive"],
    "C31": ["open", "tactical", "aggressive"],
    "C32": ["open", "tactical", "aggressive"],
    "C33": ["open", "tactical", "aggressive"],
    "C34": ["open", "tactical", "aggressive"],
    "C35": ["open", "tactical", "aggressive"],
    "C36": ["open", "tactical", "aggressive"],
    "C37": ["open", "tactical", "aggressive"],
    "C38": ["open", "tactical", "aggressive"],
    "C39": ["open", "tactical", "aggressive"],

    # Vienna Game
    "C25": ["open", "tactical"],
    "C26": ["open", "tactical"],
    "C27": ["open", "tactical"],
    "C28": ["open", "tactical"],
    "C29": ["open", "tactical"],

    # Italian Game - classical, can be sharp
    "C50": ["open", "positional"],
    "C51": ["open", "tactical", "aggressive"],  # Evans Gambit
    "C52": ["open", "tactical", "aggressive"],
    "C53": ["open", "positional"],  # Classical
    "C54": ["open", "tactical"],  # Giuoco Piano
    "C55": ["open", "tactical"],  # Two Knights
    "C56": ["open", "tactical", "aggressive"],
    "C57": ["open", "tactical", "aggressive"],  # Traxler/Fried Liver
    "C58": ["open", "tactical", "aggressive"],
    "C59": ["open", "tactical", "aggressive"],

    # Scotch
    "C44": ["open", "tactical"],
    "C45": ["open", "tactical"],

    # Ruy Lopez - classical, can be both tactical and positional
    "C60": ["open", "positional"],
    "C61": ["open", "tactical"],  # Bird's Defense
    "C62": ["open", "positional"],  # Steinitz Defense
    "C63": ["open", "tactical"],  # Schliemann/Jaenisch
    "C64": ["open", "positional"],  # Classical
    "C65": ["open", "positional"],  # Berlin
    "C66": ["open", "positional"],
    "C67": ["open", "positional", "defensive"],  # Berlin Wall
    "C68": ["open", "positional"],  # Exchange
    "C69": ["open", "positional"],
    "C70": ["open", "positional"],
    "C71": ["open", "positional"],
    "C72": ["open", "positional"],
    "C73": ["open", "positional"],
    "C74": ["open", "positional"],
    "C75": ["open", "positional"],
    "C76": ["open", "positional"],
    "C77": ["open", "positional"],
    "C78": ["open", "positional"],  # Archangelsk
    "C79": ["open", "positional"],
    "C80": ["open", "tactical"],  # Open Defense
    "C81": ["open", "tactical"],
    "C82": ["open", "tactical"],
    "C83": ["open", "tactical"],
    "C84": ["open", "positional"],  # Closed
    "C85": ["open", "positional"],
    "C86": ["open", "positional"],
    "C87": ["open", "positional"],
    "C88": ["open", "positional"],  # Anti-Marshall
    "C89": ["open", "tactical", "aggressive"],  # Marshall Attack
    "C90": ["closed", "positional"],  # Closed
    "C91": ["closed", "positional"],
    "C92": ["closed", "positional"],
    "C93": ["closed", "positional"],
    "C94": ["closed", "positional"],
    "C95": ["closed", "positional"],  # Breyer
    "C96": ["closed", "positional"],
    "C97": ["closed", "positional"],  # Chigorin
    "C98": ["closed", "positional"],
    "C99": ["closed", "positional"],

    # Petroff - solid, defensive
    "C42": ["open", "positional", "defensive"],
    "C43": ["open", "positional", "defensive"],

    # Philidor
    "C41": ["closed", "positional", "defensive"],

    # ========================================
    # D: Queen's Pawn, Closed Games
    # ========================================
    # Queen's Gambit Declined - solid, positional
    "D30": ["closed", "positional"],
    "D31": ["closed", "positional"],
    "D32": ["closed", "positional"],  # Tarrasch
    "D33": ["closed", "positional"],
    "D34": ["closed", "positional"],
    "D35": ["closed", "positional"],
    "D36": ["closed", "positional"],  # Exchange
    "D37": ["closed", "positional"],
    "D38": ["closed", "positional"],  # Ragozin
    "D39": ["closed", "positional"],
    "D40": ["closed", "positional"],  # Semi-Tarrasch
    "D41": ["closed", "positional"],
    "D42": ["closed", "positional"],
    "D43": ["closed", "positional"],  # Semi-Slav
    "D44": ["closed", "tactical", "aggressive"],  # Botvinnik
    "D45": ["closed", "positional"],
    "D46": ["closed", "positional"],
    "D47": ["closed", "positional"],  # Meran
    "D48": ["closed", "positional"],
    "D49": ["closed", "positional"],
    "D50": ["closed", "positional"],
    "D51": ["closed", "positional"],
    "D52": ["closed", "positional"],  # Cambridge Springs
    "D53": ["closed", "positional"],
    "D54": ["closed", "positional"],
    "D55": ["closed", "positional"],
    "D56": ["closed", "positional"],  # Lasker Defense
    "D57": ["closed", "positional"],
    "D58": ["closed", "positional"],  # Tartakower
    "D59": ["closed", "positional"],

    # Queen's Gambit Accepted - can be tactical
    "D20": ["open", "tactical"],
    "D21": ["open", "tactical"],
    "D22": ["open", "tactical"],
    "D23": ["open", "tactical"],
    "D24": ["open", "tactical"],
    "D25": ["open", "tactical"],
    "D26": ["open", "tactical"],
    "D27": ["open", "tactical"],
    "D28": ["open", "tactical"],
    "D29": ["open", "tactical"],

    # Slav - solid
    "D10": ["closed", "positional", "defensive"],
    "D11": ["closed", "positional"],
    "D12": ["closed", "positional"],
    "D13": ["closed", "positional"],
    "D14": ["closed", "positional"],
    "D15": ["closed", "positional"],
    "D16": ["closed", "positional"],
    "D17": ["closed", "positional"],
    "D18": ["closed", "positional"],
    "D19": ["closed", "positional"],

    # Grünfeld - tactical, aggressive for Black
    "D70": ["open", "tactical", "aggressive"],
    "D71": ["open", "tactical", "aggressive"],
    "D72": ["open", "tactical", "aggressive"],
    "D73": ["open", "tactical", "aggressive"],
    "D74": ["open", "tactical", "aggressive"],
    "D75": ["open", "tactical", "aggressive"],
    "D76": ["open", "tactical", "aggressive"],
    "D77": ["open", "tactical", "aggressive"],
    "D78": ["open", "tactical", "aggressive"],
    "D79": ["open", "tactical", "aggressive"],
    "D80": ["open", "tactical", "aggressive"],
    "D81": ["open", "tactical", "aggressive"],
    "D82": ["open", "tactical", "aggressive"],
    "D83": ["open", "tactical", "aggressive"],
    "D84": ["open", "tactical", "aggressive"],
    "D85": ["open", "tactical", "aggressive"],
    "D86": ["open", "tactical", "aggressive"],
    "D87": ["open", "tactical", "aggressive"],
    "D88": ["open", "tactical", "aggressive"],
    "D89": ["open", "tactical", "aggressive"],
    "D90": ["open", "tactical", "aggressive"],
    "D91": ["open", "tactical", "aggressive"],
    "D92": ["open", "tactical", "aggressive"],
    "D93": ["open", "tactical", "aggressive"],
    "D94": ["open", "tactical", "aggressive"],
    "D95": ["open", "tactical", "aggressive"],
    "D96": ["open", "tactical", "aggressive"],
    "D97": ["open", "tactical", "aggressive"],
    "D98": ["open", "tactical", "aggressive"],
    "D99": ["open", "tactical", "aggressive"],

    # ========================================
    # E: Indian Defenses
    # ========================================
    # King's Indian - aggressive, tactical
    "E60": ["closed", "tactical", "aggressive"],
    "E61": ["closed", "tactical", "aggressive"],
    "E62": ["closed", "positional"],  # Fianchetto
    "E63": ["closed", "positional"],
    "E64": ["closed", "positional"],
    "E65": ["closed", "positional"],
    "E66": ["closed", "positional"],
    "E67": ["closed", "positional"],
    "E68": ["closed", "positional"],
    "E69": ["closed", "positional"],
    "E70": ["closed", "tactical", "aggressive"],
    "E71": ["closed", "tactical", "aggressive"],
    "E72": ["closed", "tactical", "aggressive"],
    "E73": ["closed", "tactical", "aggressive"],
    "E74": ["closed", "tactical", "aggressive"],
    "E75": ["closed", "tactical", "aggressive"],
    "E76": ["closed", "tactical", "aggressive"],  # Four Pawns Attack
    "E77": ["closed", "tactical", "aggressive"],
    "E78": ["closed", "tactical", "aggressive"],
    "E79": ["closed", "tactical", "aggressive"],
    "E80": ["closed", "tactical", "aggressive"],  # Sämisch
    "E81": ["closed", "tactical", "aggressive"],
    "E82": ["closed", "tactical", "aggressive"],
    "E83": ["closed", "tactical", "aggressive"],
    "E84": ["closed", "tactical", "aggressive"],
    "E85": ["closed", "tactical", "aggressive"],
    "E86": ["closed", "tactical", "aggressive"],
    "E87": ["closed", "tactical", "aggressive"],
    "E88": ["closed", "tactical", "aggressive"],
    "E89": ["closed", "tactical", "aggressive"],
    "E90": ["closed", "tactical", "aggressive"],
    "E91": ["closed", "tactical", "aggressive"],
    "E92": ["closed", "tactical", "aggressive"],  # Classical
    "E93": ["closed", "tactical", "aggressive"],
    "E94": ["closed", "tactical", "aggressive"],
    "E95": ["closed", "tactical", "aggressive"],
    "E96": ["closed", "tactical", "aggressive"],
    "E97": ["closed", "tactical", "aggressive"],  # Mar del Plata
    "E98": ["closed", "tactical", "aggressive"],
    "E99": ["closed", "tactical", "aggressive"],

    # Nimzo-Indian - positional
    "E20": ["closed", "positional"],
    "E21": ["closed", "positional"],
    "E22": ["closed", "positional"],
    "E23": ["closed", "positional"],
    "E24": ["closed", "positional"],
    "E25": ["closed", "positional"],
    "E26": ["closed", "positional"],
    "E27": ["closed", "positional"],
    "E28": ["closed", "positional"],
    "E29": ["closed", "positional"],
    "E30": ["closed", "positional"],
    "E31": ["closed", "positional"],
    "E32": ["closed", "positional"],  # Classical
    "E33": ["closed", "positional"],
    "E34": ["closed", "positional"],
    "E35": ["closed", "positional"],
    "E36": ["closed", "positional"],
    "E37": ["closed", "positional"],
    "E38": ["closed", "positional"],  # Classical
    "E39": ["closed", "positional"],
    "E40": ["closed", "positional"],
    "E41": ["closed", "positional"],  # Hübner
    "E42": ["closed", "positional"],
    "E43": ["closed", "positional"],
    "E44": ["closed", "positional"],
    "E45": ["closed", "positional"],
    "E46": ["closed", "positional"],  # Rubinstein
    "E47": ["closed", "positional"],
    "E48": ["closed", "positional"],
    "E49": ["closed", "positional"],
    "E50": ["closed", "positional"],
    "E51": ["closed", "positional"],
    "E52": ["closed", "positional"],
    "E53": ["closed", "positional"],
    "E54": ["closed", "positional"],
    "E55": ["closed", "positional"],
    "E56": ["closed", "positional"],
    "E57": ["closed", "positional"],
    "E58": ["closed", "positional"],
    "E59": ["closed", "positional"],

    # Queen's Indian - solid, positional
    "E12": ["closed", "positional", "defensive"],
    "E13": ["closed", "positional", "defensive"],
    "E14": ["closed", "positional", "defensive"],
    "E15": ["closed", "positional", "defensive"],
    "E16": ["closed", "positional", "defensive"],
    "E17": ["closed", "positional", "defensive"],
    "E18": ["closed", "positional", "defensive"],
    "E19": ["closed", "positional", "defensive"],

    # Catalan - positional
    "E00": ["closed", "positional"],
    "E01": ["closed", "positional"],
    "E02": ["closed", "positional"],
    "E03": ["closed", "positional"],
    "E04": ["closed", "positional"],
    "E05": ["closed", "positional"],
    "E06": ["closed", "positional"],
    "E07": ["closed", "positional"],
    "E08": ["closed", "positional"],
    "E09": ["closed", "positional"],

    # Bogo-Indian
    "E11": ["closed", "positional", "defensive"],
}


def get_style_tags(eco: str) -> List[str]:
    """
    Get style tags for an ECO code.
    Returns empty list if ECO is unknown.
    """
    if not eco:
        return []
    # Try exact match first
    if eco in ECO_STYLE_TAGS:
        return ECO_STYLE_TAGS[eco]
    # Try prefix match (first 2 chars for family)
    prefix = eco[:2] if len(eco) >= 2 else eco
    for code, tags in ECO_STYLE_TAGS.items():
        if code.startswith(prefix):
            return tags
    return []


def is_open_opening(eco: str) -> bool:
    """Check if an ECO code represents an open position."""
    tags = get_style_tags(eco)
    return "open" in tags


def is_closed_opening(eco: str) -> bool:
    """Check if an ECO code represents a closed position."""
    tags = get_style_tags(eco)
    return "closed" in tags


def is_tactical_opening(eco: str) -> bool:
    """Check if an ECO code represents a tactical opening."""
    tags = get_style_tags(eco)
    return "tactical" in tags


def is_positional_opening(eco: str) -> bool:
    """Check if an ECO code represents a positional opening."""
    tags = get_style_tags(eco)
    return "positional" in tags
