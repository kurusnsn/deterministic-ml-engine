"""
Optimized ECO enrichment for puzzles using fuzzy matching.

This script matches puzzle opening_tags against ECO openings from eco.pgn
using normalized string matching and fuzzy scoring.

Usage:
    python scripts/enrich_puzzles_optimized.py [--test] [--limit N]

Options:
    --test      Run in test mode (10,000 puzzles only)
    --limit N   Process only N puzzles
"""

import asyncio
import chess.pgn
import re
import sys
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

import asyncpg
from rapidfuzz import fuzz, process

# Configuration
import os
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://your_db_user:your_db_password@localhost:5432/ostadchess")
ECO_PGN_PATH = os.getenv("ECO_PGN_PATH", "eco-service/eco.pgn")
BATCH_SIZE = 10000
MATCH_THRESHOLD = 80  # Minimum fuzzy match score (0-100)


@dataclass
class EcoEntry:
    """ECO opening entry."""
    eco: str
    opening: str
    variation: Optional[str]
    normalized: str  # Pre-normalized for fast matching


def normalize_name(name: str) -> str:
    """Normalize opening name for matching."""
    # Remove underscores, parentheses, and extra spaces
    normalized = name.lower()
    normalized = re.sub(r'[_\-()]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized.strip()


def parse_eco_pgn(pgn_path: str) -> List[EcoEntry]:
    """Parse eco.pgn and build list of ECO entries with normalized names."""
    entries = []
    seen = set()  # Track unique combinations to avoid duplicates

    print(f"Parsing {pgn_path}...")

    with open(pgn_path, 'r', encoding='utf-8') as f:
        game_count = 0
        while True:
            game = chess.pgn.read_game(f)
            if game is None:
                break

            game_count += 1
            eco = game.headers.get("ECO", "")
            opening = game.headers.get("Opening", "")
            variation = game.headers.get("Variation", "")

            if not eco or not opening:
                continue

            # Create full name
            if variation:
                full_name = f"{opening}: {variation}"
            else:
                full_name = opening

            # Create entry with normalized name
            normalized = normalize_name(full_name)

            # Skip duplicates
            key = (eco, normalized)
            if key in seen:
                continue
            seen.add(key)

            entries.append(EcoEntry(
                eco=eco,
                opening=opening,
                variation=variation if variation else None,
                normalized=normalized
            ))

    print(f"Parsed {game_count} games, created {len(entries)} unique ECO entries")
    return entries


def build_lookup(entries: List[EcoEntry]) -> Tuple[List[str], Dict[str, EcoEntry]]:
    """Build fast lookup structures for fuzzy matching."""
    normalized_names = [entry.normalized for entry in entries]
    name_to_entry = {entry.normalized: entry for entry in entries}
    return normalized_names, name_to_entry


def find_best_match(tags: List[str], normalized_names: List[str],
                    name_to_entry: Dict[str, EcoEntry]) -> Optional[EcoEntry]:
    """Find best ECO match for given opening tags using fuzzy matching."""
    best_score = 0
    best_entry = None

    for tag in tags:
        if not tag:
            continue

        # Normalize the tag
        normalized_tag = normalize_name(tag)

        # Try exact match first (very fast)
        if normalized_tag in name_to_entry:
            return name_to_entry[normalized_tag]

        # Fuzzy match
        result = process.extractOne(
            normalized_tag,
            normalized_names,
            scorer=fuzz.WRatio,
            score_cutoff=MATCH_THRESHOLD
        )

        if result and result[1] > best_score:
            best_score = result[1]
            best_entry = name_to_entry[result[0]]

    return best_entry


async def enrich_puzzles(test_mode: bool = False, limit: Optional[int] = None):
    """Enrich puzzles with ECO data."""

    # Parse ECO data
    eco_entries = parse_eco_pgn(ECO_PGN_PATH)
    normalized_names, name_to_entry = build_lookup(eco_entries)

    print(f"\nBuilt lookup with {len(normalized_names)} entries")

    # Connect to database
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        # Determine limit
        if test_mode:
            limit = 10000
            print(f"\n🧪 TEST MODE: Processing {limit} puzzles")
        elif limit:
            print(f"\nProcessing {limit} puzzles")

        # Get total count
        total_query = """
            SELECT COUNT(*) FROM puzzles
            WHERE opening_tags IS NOT NULL
            AND array_length(opening_tags, 1) > 0
            AND (eco IS NULL OR eco = '')
        """
        if limit:
            total_to_process = min(limit, await conn.fetchval(total_query))
        else:
            total_to_process = await conn.fetchval(total_query)

        print(f"Total puzzles to process: {total_to_process}")

        processed = 0
        matched = 0

        while processed < total_to_process:
            # Fetch batch
            batch_limit = min(BATCH_SIZE, total_to_process - processed)

            puzzles = await conn.fetch(f"""
                SELECT id, opening_tags FROM puzzles
                WHERE opening_tags IS NOT NULL
                AND array_length(opening_tags, 1) > 0
                AND (eco IS NULL OR eco = '')
                LIMIT ${1}
            """, batch_limit)

            if not puzzles:
                break

            # Process batch
            updates = []
            for puzzle in puzzles:
                processed += 1

                # Find best match
                match = find_best_match(
                    puzzle['opening_tags'],
                    normalized_names,
                    name_to_entry
                )

                if match:
                    matched += 1
                    updates.append((
                        match.eco,
                        match.opening,
                        match.variation,
                        puzzle['id']
                    ))

            # Bulk update
            if updates:
                await conn.executemany("""
                    UPDATE puzzles
                    SET eco = $1, opening = $2, variation = $3
                    WHERE id = $4
                """, updates)

            # Progress update
            match_rate = (matched / processed * 100) if processed > 0 else 0
            print(f"Progress: {processed}/{total_to_process} puzzles "
                  f"({matched} matched, {match_rate:.1f}%)", end='\r')

        print(f"\n✅ Complete! Processed {processed} puzzles, matched {matched} ({matched/processed*100:.1f}%)")

    finally:
        await conn.close()


def main():
    """Main entry point."""
    test_mode = '--test' in sys.argv
    limit = None

    # Check for --limit flag
    if '--limit' in sys.argv:
        try:
            idx = sys.argv.index('--limit')
            limit = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            print("Error: --limit requires a number")
            sys.exit(1)

    asyncio.run(enrich_puzzles(test_mode=test_mode, limit=limit))


if __name__ == "__main__":
    main()
