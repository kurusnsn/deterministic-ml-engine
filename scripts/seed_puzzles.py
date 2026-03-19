"""
Seed the puzzles table from the compressed Lichess puzzle database.

Usage:
    python scripts/seed_puzzles.py

Environment variables:
    DATABASE_URL    - Postgres connection string (required)
    PUZZLE_SOURCE   - Path to lichess_db_puzzle.csv.zst (default: data/lichess_db_puzzle.csv.zst)
    BATCH_SIZE      - Number of rows per insert batch (default: 5000)
"""

import asyncio
import csv
import io
import os
from typing import Any, Dict, List, Optional

import asyncpg
import zstandard

DATABASE_URL = os.getenv("DATABASE_URL")
PUZZLE_SOURCE = os.getenv("PUZZLE_SOURCE", "data/lichess_db_puzzle.csv.zst")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "5000"))


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS puzzles (
    id TEXT PRIMARY KEY,
    fen TEXT NOT NULL,
    moves TEXT[] NOT NULL,
    rating INT,
    rating_deviation INT,
    popularity INT,
    nb_plays INT,
    themes TEXT[],
    game_url TEXT,
    opening_tags TEXT[],
    eco TEXT,
    opening TEXT,
    variation TEXT
);
"""

INSERT_SQL = """
INSERT INTO puzzles (
    id, fen, moves, rating, rating_deviation, popularity,
    nb_plays, themes, game_url, opening_tags
)
VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10
)
ON CONFLICT (id) DO NOTHING;
"""


def _parse_list(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.replace(",", " ").split() if part.strip()]


def _parse_row(row: Dict[str, str]) -> List[Any]:
    moves = row.get("Moves", "")
    move_list = [m for m in moves.split() if m]

    return [
        row.get("PuzzleId"),
        row.get("FEN"),
        move_list,
        int(row["Rating"]) if row.get("Rating") else None,
        int(row["RatingDeviation"]) if row.get("RatingDeviation") else None,
        int(row["Popularity"]) if row.get("Popularity") else None,
        int(row["NbPlays"]) if row.get("NbPlays") else None,
        _parse_list(row.get("Themes")),
        row.get("GameUrl"),
        _parse_list(row.get("OpeningTags")),
    ]


async def seed_puzzles():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable must be set.")

    if not os.path.exists(PUZZLE_SOURCE):
        raise FileNotFoundError(f"Puzzle source not found at {PUZZLE_SOURCE}")

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(CREATE_TABLE_SQL)

        inserted = 0
        batch: List[List[Any]] = []

        dctx = zstandard.ZstdDecompressor()
        with open(PUZZLE_SOURCE, "rb") as compressed:
            with dctx.stream_reader(compressed) as reader:
                text_stream = io.TextIOWrapper(reader, encoding="utf-8")
                csv_reader = csv.DictReader(text_stream)

                async with conn.transaction():
                    for row in csv_reader:
                        batch.append(_parse_row(row))
                        if len(batch) >= BATCH_SIZE:
                            await conn.executemany(INSERT_SQL, batch)
                            inserted += len(batch)
                            print(f"Inserted {inserted} puzzles...", end="\r")
                            batch.clear()

                    if batch:
                        await conn.executemany(INSERT_SQL, batch)
                        inserted += len(batch)

        print(f"\nFinished seeding {inserted} puzzles.")
    finally:
        await conn.close()


def main():
    asyncio.run(seed_puzzles())


if __name__ == "__main__":
    main()
