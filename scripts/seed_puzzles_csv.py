"""
Seed the puzzles table from the Lichess puzzle CSV file.

Usage:
    python scripts/seed_puzzles_csv.py

Environment variables:
    DATABASE_URL    - Postgres connection string (required)
    PUZZLE_SOURCE   - Path to lichess_db_puzzle.csv (default: puzzledata/lichess_db_puzzle.csv)
    BATCH_SIZE      - Number of rows per insert batch (default: 5000)
"""

import asyncio
import csv
import os
from typing import Any, Dict, List, Optional

import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://your_db_user:your_db_password@localhost:5432/ostadchess")
PUZZLE_SOURCE = os.getenv("PUZZLE_SOURCE", "puzzledata/lichess_db_puzzle.csv")
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

        with open(PUZZLE_SOURCE, "r", encoding="utf-8") as csvfile:
            csv_reader = csv.DictReader(csvfile)

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
