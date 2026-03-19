"""
Enrich puzzles with ECO metadata using fuzzy matching against ECO openings.

Usage:
    python scripts/enrich_puzzles_with_eco.py

Environment variables:
    DATABASE_URL        - Postgres connection string (required)
    ECO_SOURCE          - Path to eco_openings.json (default: data/eco_openings.json)
    MATCH_THRESHOLD     - Minimum rapidfuzz score to accept (default: 78)
    BATCH_SIZE          - Number of updates to batch per transaction (default: 2000)
"""

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import asyncpg
from rapidfuzz import fuzz, process

DATABASE_URL = os.getenv("DATABASE_URL")
ECO_SOURCE = os.getenv("ECO_SOURCE", "data/eco_openings.json")
MATCH_THRESHOLD = int(os.getenv("MATCH_THRESHOLD", "78"))
BATCH_SIZE = int(os.getenv("ENRICH_BATCH_SIZE", "2000"))


@dataclass(frozen=True)
class OpeningEntry:
    eco: str
    name: str
    variation: Optional[str] = None

    @property
    def full_name(self) -> str:
        return f"{self.name} – {self.variation}" if self.variation else self.name


async def load_openings() -> List[OpeningEntry]:
    if not os.path.exists(ECO_SOURCE):
        raise FileNotFoundError(f"ECO source not found at {ECO_SOURCE}")

    with open(ECO_SOURCE, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    entries: List[OpeningEntry] = []
    for item in data:
        entries.append(
            OpeningEntry(
                eco=item.get("eco", ""),
                name=item.get("name", ""),
                variation=item.get("variation"),
            )
        )
    return entries


def build_lookup(openings: Iterable[OpeningEntry]) -> Tuple[List[str], Dict[str, OpeningEntry]]:
    labels: List[str] = []
    mapping: Dict[str, OpeningEntry] = {}
    for entry in openings:
        label = entry.full_name.lower()
        labels.append(label)
        mapping[label] = entry
    return labels, mapping


async def enrich():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable must be set.")

    openings = await load_openings()
    if not openings:
        print("No openings loaded; skipping enrichment.")
        return

    labels, mapping = build_lookup(openings)

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        stmt = await conn.prepare(
            """
            SELECT id, opening_tags
            FROM puzzles
            WHERE (eco IS NULL OR eco = '')
              AND opening_tags IS NOT NULL
            """
        )

        updates: List[Tuple[str, str, Optional[str], str]] = []
        processed = 0

        async with conn.transaction():
            async for record in stmt.cursor():
                processed += 1
                tags = record["opening_tags"] or []
                candidate = best_match(tags, labels, mapping)
                if candidate:
                    updates.append(
                        (
                            candidate.eco,
                            candidate.name,
                            candidate.variation,
                            record["id"],
                        )
                    )

                if len(updates) >= BATCH_SIZE:
                    await _apply_updates(conn, updates)
                    updates.clear()
                    print(f"Processed {processed} puzzles...", end="\r")

            if updates:
                await _apply_updates(conn, updates)
                print(f"Processed {processed} puzzles...")

    finally:
        await conn.close()


async def _apply_updates(conn: asyncpg.Connection, updates: List[Tuple[str, str, Optional[str], str]]):
    await conn.executemany(
        """
        UPDATE puzzles
        SET eco = $1,
            opening = $2,
            variation = $3
        WHERE id = $4
        """,
        updates,
    )


def best_match(tags: Iterable[str], labels: List[str], mapping: Dict[str, OpeningEntry]) -> Optional[OpeningEntry]:
    best_score = -1
    best_entry: Optional[OpeningEntry] = None
    for tag in tags:
        tag_norm = tag.lower()
        match = process.extractOne(tag_norm, labels, scorer=fuzz.WRatio)
        if not match:
            continue
        label, score, _ = match
        if score >= MATCH_THRESHOLD and score > best_score:
            best_score = score
            best_entry = mapping[label]
    return best_entry


def main():
    asyncio.run(enrich())


if __name__ == "__main__":
    main()
