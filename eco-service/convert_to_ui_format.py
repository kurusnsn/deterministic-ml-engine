#!/usr/bin/env python3
"""
Convert opening_cards.json to OpeningSystem format for the UI.

This generates:
1. opening_systems.json - The card data for OpeningsBrowser
2. opening_lines/*.json - Individual line files for each opening
"""

import json
import os
import re
from typing import List, Dict
import urllib.request
import urllib.error

# Chess starting position
START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Gateway URL for popularity lookup
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")


def fetch_popularity(fens: List[str]) -> Dict[str, int]:
    """
    Fetch game counts for a list of FEN positions from the opening-book-service.
    Returns a dict mapping FEN -> game count.
    Falls back to empty dict if service is unavailable.
    """
    if not fens:
        return {}
    
    try:
        url = f"{GATEWAY_URL}/opening/popularity/by-fens"
        data = json.dumps({"fens": fens}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.load(resp)
            return {item["fen"]: item["games"] for item in result.get("items", [])}
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"Warning: Could not fetch popularity data: {e}")
        print("Continuing without popularity...")
        return {}


def parse_pgn_moves(pgn: str) -> List[str]:
    """Extract individual moves from PGN notation."""
    # Remove move numbers and result
    cleaned = re.sub(r'\d+\.+', '', pgn)
    cleaned = re.sub(r'\*$', '', cleaned)
    moves = cleaned.split()
    return [m.strip() for m in moves if m.strip()]

def determine_type(name: str, lines_count: int) -> str:
    """Determine opening type: forcing, semi-forcing, or neutral."""
    name_lower = name.lower()
    
    # Gambits are forcing
    if "gambit" in name_lower:
        return "forcing"
    
    # Traps and aggressive lines
    if any(x in name_lower for x in ["trap", "attack", "counter"]):
        return "semi-forcing"
    
    # Many lines suggest deep theory (neutral)
    if lines_count > 20:
        return "neutral"
    
    # Few lines might be forcing
    if lines_count <= 5:
        return "semi-forcing"
    
    return "neutral"

def derive_family_id(card_id: str, name: str) -> str:
    """Derive a family ID for grouping related openings."""
    # Remove gambit/declined/accepted suffixes for family grouping
    family = re.sub(r'-(gambit|declined|accepted|counter-gambit|half-accepted)$', '', card_id)
    return family

def generate_fen_from_moves(moves: List[str]) -> str:
    """
    Generate FEN from a list of moves using python-chess.
    """
    import chess
    board = chess.Board()
    for move_san in moves:
        try:
            board.push_san(move_san)
        except Exception as e:
            print(f"Error pushing move {move_san}: {e}")
            break
    return board.fen()


def convert_to_opening_systems(cards_data: Dict) -> List[Dict]:
    """Convert opening_cards.json format to OpeningSystem format."""
    systems = []
    
    for card in cards_data["cards"]:
        # Parse canonical moves from the defining_moves PGN
        canonical_moves = parse_pgn_moves(card["defining_moves"])
        
        # Skip if no moves (shouldn't happen)
        if not canonical_moves:
            continue
        
        system = {
            "id": card["id"],
            "familyId": derive_family_id(card["id"], card["name"]),
            "name": card["name"],
            "ecoCodes": card["eco_codes"],
            "type": determine_type(card["name"], len(card["lines"])),
            "canonicalMoves": canonical_moves,
            "fen": generate_fen_from_moves(canonical_moves),
            "perspective": card["perspective"],
            "lineCount": len(card["lines"])
        }

        
        systems.append(system)
    
    return systems

def generate_line_files(cards_data: Dict, output_dir: str):
    """Generate individual line files for each opening."""
    os.makedirs(output_dir, exist_ok=True)
    
    for card in cards_data["cards"]:
        lines = []
        for i, line in enumerate(card["lines"]):
            moves = parse_pgn_moves(line["pgn"])
            lines.append({
                "id": f"{card['id']}-line-{i}",
                "name": line["name"],
                "moves": moves,
                "eco": line["eco"]
            })
        
        line_file = {
            "opening": card["name"],
            "openingId": card["id"],
            "perspective": card["perspective"],
            "lines": lines,
            "generatedAt": cards_data.get("version", "1.0")
        }
        
        filepath = os.path.join(output_dir, f"{card['id']}.json")
        with open(filepath, 'w') as f:
            json.dump(line_file, f, indent=2, ensure_ascii=False)
    
    print(f"Generated {len(cards_data['cards'])} line files in {output_dir}")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Input: opening_cards.json from eco-service
    cards_file = os.path.join(script_dir, "opening_cards.json")
    
    # Output: UI data files
    ui_dir = os.path.join(script_dir, "..", "ui", "public", "data", "openings")
    systems_file = os.path.join(ui_dir, "opening_systems.json")
    lines_dir = os.path.join(ui_dir, "opening_lines")
    
    # Load cards
    print(f"Loading {cards_file}...")
    with open(cards_file, 'r') as f:
        cards_data = json.load(f)
    
    print(f"Found {len(cards_data['cards'])} cards")
    
    # Convert to OpeningSystem format
    print("Converting to OpeningSystem format...")
    systems = convert_to_opening_systems(cards_data)
    
    # Fetch popularity data from opening-book-service
    print("Fetching popularity data...")
    fens = [s["fen"] for s in systems]
    popularity_map = fetch_popularity(fens)
    
    # Add popularity to each system
    for system in systems:
        system["popularity"] = popularity_map.get(system["fen"], 0)
    
    popularity_count = sum(1 for s in systems if s["popularity"] > 0)
    print(f"Got popularity for {popularity_count}/{len(systems)} openings")
    
    # Sort by popularity (highest first), then by name as tiebreaker
    systems.sort(key=lambda s: (-s["popularity"], s["name"]))
    
    # Write opening_systems.json
    os.makedirs(ui_dir, exist_ok=True)
    with open(systems_file, 'w') as f:
        json.dump(systems, f, indent=2, ensure_ascii=False)
    print(f"Written {len(systems)} systems to {systems_file}")
    
    # Generate line files
    print("Generating line files...")
    generate_line_files(cards_data, lines_dir)
    
    # Summary
    print("\n=== Summary ===")
    print(f"Total systems: {len(systems)}")
    print(f"Forcing openings: {sum(1 for s in systems if s['type'] == 'forcing')}")
    print(f"Semi-forcing: {sum(1 for s in systems if s['type'] == 'semi-forcing')}")
    print(f"Neutral: {sum(1 for s in systems if s['type'] == 'neutral')}")
    
    if popularity_count > 0:
        top5 = systems[:5]
        print("\nTop 5 by popularity:")
        for i, s in enumerate(top5, 1):
            print(f"  {i}. {s['name']} ({s['popularity']:,} games)")

if __name__ == "__main__":
    main()

