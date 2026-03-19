#!/usr/bin/env python3
"""
ECO PGN to Opening Cards Parser

This script parses the eco.pgn file and generates a curated opening_cards.json
file with properly grouped opening cards for the Opening Trainer feature.

Grouping Rules:
- A00: Group by White's 1st move (irregular openings)
- A01-A39: Group by system name (English, Reti, Bird, etc.)
- A40-A99: Group by Black's defense (Dutch, Benoni, etc.)
- B00-B99: Group by Black's defense (Sicilian, French, Caro-Kann, etc.)
- C00-C99: Group by opening name, with sub-splits for distinct systems
- D00-D99: Group by system (QGD, Slav, etc.)
- E00-E99: Group by Black's system (Nimzo, QID, KID, etc.)

Perspective Rules:
- If the defining move ends with White's move → perspective: "white"
- If the defining move ends with Black's move → perspective: "black"
"""

import re
import json
from collections import defaultdict
from typing import Dict, List, Tuple, Optional

def parse_pgn_entry(entry: str) -> Optional[Dict]:
    """Parse a single PGN entry into a structured dict."""
    eco_match = re.search(r'\[ECO "([^"]+)"\]', entry)
    opening_match = re.search(r'\[Opening "([^"]+)"\]', entry)
    variation_match = re.search(r'\[Variation "([^"]+)"\]', entry)
    
    # Find the moves line (starts with 1.)
    moves_match = re.search(r'\n(1\..+?)(?:\*|1-0|0-1|1/2-1/2)', entry, re.DOTALL)
    
    if not eco_match or not opening_match:
        return None
    
    moves = ""
    if moves_match:
        moves = moves_match.group(1).strip()
        # Clean up the moves - remove newlines and extra spaces
        moves = re.sub(r'\s+', ' ', moves).strip()
    
    return {
        "eco": eco_match.group(1),
        "opening": opening_match.group(1),
        "variation": variation_match.group(1) if variation_match else None,
        "moves": moves
    }

def parse_eco_file(filepath: str) -> List[Dict]:
    """Parse the entire eco.pgn file."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Split by ECO entries
    entries = re.split(r'\n(?=\[ECO)', content)
    
    parsed = []
    for entry in entries:
        if '[ECO' in entry:
            result = parse_pgn_entry(entry)
            if result:
                parsed.append(result)
    
    return parsed

def get_first_move(moves: str) -> str:
    """Extract White's first move from a move string."""
    match = re.match(r'1\.\s*(\S+)', moves)
    return match.group(1) if match else ""

def get_move_count(moves: str) -> int:
    """Count how many half-moves are in the sequence."""
    # Remove move numbers and count pieces/squares
    cleaned = re.sub(r'\d+\.+', '', moves)
    parts = cleaned.split()
    return len(parts)

def is_white_to_move_last(moves: str) -> bool:
    """Determine if the last move was made by White."""
    move_count = get_move_count(moves)
    return move_count % 2 == 1

def normalize_opening_name(name: str) -> str:
    """Normalize opening names for grouping.
    
    IMPORTANT: Check specific mappings FIRST before stripping suffixes,
    to preserve distinct systems like 'Scotch Gambit' vs 'Scotch'.
    """
    
    # Specific mappings - these take priority and preserve distinct systems
    specific_mappings = {
        # Gambits that should stay separate
        "Scotch gambit": "Scotch Gambit",
        "Scotch opening": "Scotch",
        "Scotch game": "Scotch",
        "Scotch": "Scotch",
        "Vienna gambit": "Vienna Gambit",
        "Vienna game": "Vienna",
        "Vienna": "Vienna",
        "Evans gambit declined": "Evans Gambit Declined",
        "Evans gambit": "Evans Gambit",
        "Evans counter-gambit": "Evans Gambit",
        "Ponziani counter-gambit": "Ponziani Counter-Gambit",
        "Ponziani opening": "Ponziani",
        "Ponziani": "Ponziani",
        "Benko gambit accepted": "Benko Gambit Accepted",
        "Benko gambit half accepted": "Benko Gambit Half Accepted",
        "Benko gambit": "Benko Gambit",
        "Benko's opening": "Benko Opening",
        "Blumenfeld counter-gambit": "Blumenfeld Counter-Gambit",
        "Budapest defence declined": "Budapest Declined",
        "Budapest defence": "Budapest",
        "Budapest": "Budapest",
        "Danish gambit": "Danish Gambit",
        "Centre game": "Center Game",
        "Blackmar-Diemer gambit": "Blackmar-Diemer Gambit",
        "Blackmar-Diemer": "Blackmar-Diemer Gambit",
        "Blackmar gambit": "Blackmar Gambit",
        "KGA": "King's Gambit Accepted",
        "KGD": "King's Gambit Declined",
        "QGD semi-Slav": "Semi-Slav",
        "QGD Slav": "Slav",
        "QGD": "Queen's Gambit Declined",
        "QGA": "Queen's Gambit Accepted",
        "Giuoco Pianissimo": "Giuoco Pianissimo",
        "Giuoco Piano": "Giuoco Piano",
        "Polish (Sokolsky)": "Polish",
        "Grob's": "Grob",
        "Grob": "Grob",
        "Clemenz (Mead's, Basman's or de Klerk's)": "Clemenz",
        "Amar (Paris)": "Amar",
        "Dunst (Sleipner, Heinrichsen)": "Dunst",
        "Ware (Meadow Hay)": "Ware",
        "Van't Kruijs": "Van't Kruijs",
        "Hammerschlag (Fried fox/Pork chop opening)": "Hammerschlag",
        "Anti-Borg (Desprez)": "Anti-Borg",
        "Nimzovich-Larsen": "Nimzo-Larsen",
        "Bird's": "Bird",
        "Bird": "Bird",
        "Reti": "Reti",
        "English": "English",
        "Queen's pawn": "Queen's Pawn",
        "Robatsch (modern)": "Modern Defence",
        "Robatsch": "Pirc/Modern",
        "King's pawn": "King's Pawn Game",
        "Sicilian": "Sicilian",
        "French": "French",
        "Caro-Kann": "Caro-Kann",
        "Pirc": "Pirc",
        "Alekhine's": "Alekhine",
        "Scandinavian": "Scandinavian",
        "Petrov": "Petrov",
        "Philidor": "Philidor",
        "Two knights": "Two Knights",
        "two knights": "Two Knights",
        "Ruy Lopez": "Ruy Lopez",
        "Four knights": "Four Knights",
        "Three knights": "Three Knights",
        "Hungarian": "Hungarian",
        "Slav": "Slav",
        "Semi-Slav": "Semi-Slav",
        "Catalan": "Catalan",
        "Bogo-Indian": "Bogo-Indian",
        "Nimzo-Indian": "Nimzo-Indian",
        "Queen's Indian": "Queen's Indian",
        "King's Indian": "King's Indian",
        "Gruenfeld": "Grünfeld",
        "Grunfeld": "Grünfeld",
        "Benoni": "Benoni",
        "Old Benoni": "Old Benoni",
        "Dutch": "Dutch",
        "Old Indian": "Old Indian",
        "Torre": "Torre Attack",
        "London": "London System",
        "Colle": "Colle System",
        "Bishop's": "Bishop's Opening",
    }
    
    # Check specific mappings first (case-insensitive prefix match)
    name_lower = name.lower()
    for pattern, replacement in specific_mappings.items():
        if name_lower.startswith(pattern.lower()):
            return replacement
    
    # If no specific mapping, clean up the name
    cleaned = re.sub(r",?\s*(opening|defence|defense|attack|system|variation)$", "", name, flags=re.I)
    cleaned = cleaned.strip()
    
    return cleaned if cleaned else name


def determine_card_key(entry: Dict) -> str:
    """Determine which card this entry belongs to.
    
    Key insight: Group by NORMALIZED NAME, not by ECO code.
    This ensures Blackmar-Diemer Gambit from A45 and D00 go into the same card.
    Also merges 'accepted', 'declined', 'half accepted' into the parent gambit.
    """
    eco = entry["eco"]
    opening = entry["opening"]
    moves = entry["moves"]
    variation = entry.get("variation", "")
    
    # Variations that should be promoted to their own cards
    # These are often important gambits listed as variations of broader openings
    promoted_variations = {
        "englund gambit": "Englund Gambit",
        "charlick (englund) gambit": "Englund Gambit",
        "wing gambit": "Wing Gambit",
        "wing gambit, santasiere variation": "Wing Gambit",
        "wing gambit, marshall variation": "Wing Gambit",
        "wing gambit, marienbad variation": "Wing Gambit",
        "wing gambit, carlsbad variation": "Wing Gambit",
        "wing gambit deferred": "Wing Gambit",
        "smith-morra gambit": "Smith-Morra Gambit",
        "smith-morra gambit, chicago defence": "Smith-Morra Gambit",
    }

    
    if variation:
        var_lower = variation.lower()
        for pattern, card_name in promoted_variations.items():
            if var_lower.startswith(pattern) or var_lower == pattern:
                return card_name.lower()
    
    # A00 - Group by first move (irregular openings)
    if eco == "A00":
        first_move = get_first_move(moves)
        return f"A00_{first_move}"

    
    # Normalize the opening name
    normalized = normalize_opening_name(opening)
    
    # Merge accepted/declined/half-accepted into parent gambit
    # e.g., "Benko Gambit Accepted" -> "Benko Gambit"
    parent_name = re.sub(r'\s+(Accepted|Declined|Half Accepted|Counter-Gambit)$', '', normalized, flags=re.I)
    
    # Use lowercase for case-insensitive grouping
    # Prevents "King's Gambit" and "King's gambit" from becoming separate cards
    return parent_name.lower()



def determine_perspective(moves: str, opening: str) -> str:
    """Determine if this should be trained from White's or Black's perspective."""
    # Black defenses - perspective is Black
    black_openings = [
        "Sicilian", "French", "Caro-Kann", "Pirc", "Modern", "Alekhine",
        "Scandinavian", "Philidor", "Petrov", "Hungarian", "Dutch",
        "Benoni", "King's Indian", "Nimzo-Indian", "Queen's Indian",
        "Bogo-Indian", "Grünfeld", "Slav", "Semi-Slav", "QGD", "QGA"
    ]
    
    for defense in black_openings:
        if defense.lower() in opening.lower():
            return "black"
    
    # Most other openings are White systems
    return "white"

def create_cards(entries: List[Dict]) -> List[Dict]:
    """Group entries into opening cards."""
    # Group entries by card key
    groups = defaultdict(list)
    for entry in entries:
        key = determine_card_key(entry)
        groups[key].append(entry)
    
    cards = []
    for key, group_entries in sorted(groups.items()):
        # Use the first entry as the base
        base = group_entries[0]
        
        # Find the shortest move sequence as the "defining" moves
        defining_entry = min(group_entries, key=lambda e: get_move_count(e["moves"]))
        
        # Collect all ECO codes in this group
        eco_codes = sorted(set(e["eco"] for e in group_entries))
        
        # Determine the card name - prefer the grouping key (parent name)
        card_name = key
        
        # For A00, use a more descriptive name
        if base["eco"] == "A00":
            card_name = normalize_opening_name(base["opening"])
            first_move = get_first_move(base["moves"])
            card_name = f"{card_name} (1.{first_move})"
        
        # Determine perspective
        perspective = determine_perspective(defining_entry["moves"], card_name)
        
        # 1. Deduplicate lines: Remove any line that is a prefix of another line
        # This cleans up the progressive steps (1.e4, 1.e4 e5, 1.e4 e5 2.Nf3)
        # and keeps only the terminal variations.
        unique_entries = []
        # Sort by length descending to easily check prefixes
        sorted_entries = sorted(group_entries, key=lambda e: get_move_count(e["moves"]), reverse=True)
        
        for entry in sorted_entries:
            is_prefix = False
            for existing in unique_entries:
                if existing["moves"].startswith(entry["moves"]) and len(existing["moves"]) > len(entry["moves"]):
                    is_prefix = True
                    break
            if not is_prefix:
                unique_entries.append(entry)
        
        # 2. Build lines with unique names
        lines = []
        # Count occurrences of names to identify duplicates
        name_counts = defaultdict(int)
        for entry in unique_entries:
            name_counts[entry["variation"] if entry["variation"] else "Main Line"] += 1
            
        for entry in unique_entries:
            base_name = entry["variation"] if entry["variation"] else "Main Line"
            
            # If multiple lines have the same name (like 'Main Line'), differentiate them
            if name_counts[base_name] > 1:
                line_name = f"{base_name} ({entry['eco']})"
            else:
                line_name = base_name
                
            lines.append({
                "name": line_name,
                "eco": entry["eco"],
                "pgn": entry["moves"]
            })
        
        # Sort lines by move count (shortest first)
        lines.sort(key=lambda l: get_move_count(l["pgn"]))
        
        # Create card ID
        card_id = re.sub(r'[^a-z0-9]+', '-', card_name.lower()).strip('-')
        
        card = {
            "id": card_id,
            "name": card_name,
            "eco_codes": eco_codes,
            "defining_moves": defining_entry["moves"],
            "perspective": perspective,
            "lines": lines
        }
        
        cards.append(card)
    
    return cards


def get_custom_cards() -> List[Dict]:
    """
    Manual entries for openings not in eco.pgn but important for trainers.
    """
    return [
        {
            "id": "halloween-gambit",
            "name": "Halloween Gambit",
            "eco_codes": ["C47"],
            "defining_moves": "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5",
            "perspective": "white",
            "lines": [
                {
                    "name": "Main Line",
                    "eco": "C47",
                    "pgn": "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5"
                },
                {
                    "name": "Accepted",
                    "eco": "C47", 
                    "pgn": "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5 Nxe5 5. d4"
                },
                {
                    "name": "Declined",
                    "eco": "C47",
                    "pgn": "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Nxe5 Nxe4"
                }
            ]
        }
    ]


def main():
    import os
    
    # Get the directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    eco_file = os.path.join(script_dir, "eco.pgn")
    output_file = os.path.join(script_dir, "opening_cards.json")
    
    print(f"Parsing {eco_file}...")
    entries = parse_eco_file(eco_file)
    print(f"Found {len(entries)} entries")
    
    print("Creating cards...")
    cards = create_cards(entries)
    
    # Add custom cards not in eco.pgn
    custom_cards = get_custom_cards()
    cards.extend(custom_cards)
    print(f"Created {len(cards)} cards (including {len(custom_cards)} custom)")
    
    # Write output
    output = {
        "version": "1.0",
        "total_entries": len(entries),
        "total_cards": len(cards),
        "cards": cards
    }
    
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"Written to {output_file}")
    
    # Print summary by ECO range
    print("\nSummary by ECO range:")
    eco_ranges = defaultdict(int)
    for card in cards:
        first_eco = card["eco_codes"][0]
        eco_ranges[first_eco[0]] += 1
    
    for letter, count in sorted(eco_ranges.items()):
        print(f"  {letter}xx: {count} cards")

if __name__ == "__main__":
    main()

