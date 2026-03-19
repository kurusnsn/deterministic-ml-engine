#!/usr/bin/env python3
"""
Backfill `moves` rows from stored `games.pgn`.

Use this when `games` has PGNs but `moves` is empty or incomplete, so
opening explorer queries can use indexed move/FEN data directly.

Examples:
  DATABASE_URL=postgresql://... python scripts/backfill_moves_from_games.py
  DATABASE_URL=postgresql://... python scripts/backfill_moves_from_games.py --force-all
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import time
from typing import Iterable, Sequence

import asyncpg
import chess.pgn

VALID_RESULTS = {"1-0", "0-1", "1/2-1/2", "½-½", "*"}

MOVE_INSERT_SQL = """
INSERT INTO moves (game_id, ply, san, uci, fen_before, fen_after)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (game_id, ply) DO UPDATE
SET
  san = EXCLUDED.san,
  uci = EXCLUDED.uci,
  fen_before = EXCLUDED.fen_before,
  fen_after = EXCLUDED.fen_after
"""

GAME_RESULT_UPDATE_SQL = """
UPDATE games
SET result = $2
WHERE id = $1 AND (result IS NULL OR result = '')
"""

MOVES_FEN_KEY_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS moves_fen_key_idx
ON moves (
  (
    split_part(fen_before, ' ', 1) || ' ' ||
    split_part(fen_before, ' ', 2) || ' ' ||
    split_part(fen_before, ' ', 3) || ' ' ||
    split_part(fen_before, ' ', 4)
  )
)
"""


def chunks(seq: Sequence[tuple], size: int) -> Iterable[Sequence[tuple]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def parse_moves_from_pgn(game_id: int, pgn_text: str) -> tuple[str | None, list[tuple]]:
    parsed = chess.pgn.read_game(io.StringIO(pgn_text))
    if parsed is None:
        return None, []

    board = parsed.board()
    records: list[tuple] = []
    ply = 1
    for move in parsed.mainline_moves():
        fen_before = board.fen()
        san = board.san(move)
        uci = move.uci()
        board.push(move)
        fen_after = board.fen()
        records.append((game_id, ply, san, uci, fen_before, fen_after))
        ply += 1

    result = (parsed.headers.get("Result") or "").strip()
    if result not in VALID_RESULTS:
        result = None

    return result, records


async def backfill(
    database_url: str,
    batch_size: int,
    move_chunk_size: int,
    limit: int,
    force_all: bool,
    create_index: bool,
) -> None:
    pool = await asyncpg.create_pool(database_url, min_size=1, max_size=4)

    started = time.time()
    total_games_seen = 0
    parsed_games = 0
    parse_errors = 0
    moves_written = 0
    results_updated = 0
    last_id = 0
    remaining = limit if limit > 0 else None

    try:
        async with pool.acquire() as conn:
            if create_index:
                await conn.execute(MOVES_FEN_KEY_INDEX_SQL)

        while True:
            if remaining is not None and remaining <= 0:
                break

            effective_batch = batch_size if remaining is None else min(batch_size, remaining)

            missing_clause = "" if force_all else "AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id)"
            fetch_sql = f"""
                SELECT g.id, g.pgn, g.result
                FROM games g
                WHERE g.id > $1
                  AND g.pgn IS NOT NULL
                  AND g.pgn <> ''
                  {missing_clause}
                ORDER BY g.id
                LIMIT $2
            """

            async with pool.acquire() as conn:
                rows = await conn.fetch(fetch_sql, last_id, effective_batch)

            if not rows:
                break

            total_games_seen += len(rows)
            last_id = rows[-1]["id"]
            if remaining is not None:
                remaining -= len(rows)

            move_records: list[tuple] = []
            result_updates: list[tuple[int, str]] = []

            for row in rows:
                game_id = row["id"]
                pgn_text = row["pgn"]
                db_result = (row["result"] or "").strip()
                if not pgn_text:
                    continue

                try:
                    parsed_result, records = parse_moves_from_pgn(game_id, pgn_text)
                except Exception:
                    parse_errors += 1
                    continue

                parsed_games += 1
                move_records.extend(records)

                if parsed_result and not db_result:
                    result_updates.append((game_id, parsed_result))

            async with pool.acquire() as conn:
                async with conn.transaction():
                    for chunk in chunks(move_records, move_chunk_size):
                        await conn.executemany(MOVE_INSERT_SQL, chunk)
                        moves_written += len(chunk)

                    if result_updates:
                        await conn.executemany(GAME_RESULT_UPDATE_SQL, result_updates)
                        results_updated += len(result_updates)

            elapsed = time.time() - started
            print(
                f"[backfill] games_seen={total_games_seen} parsed={parsed_games} "
                f"parse_errors={parse_errors} moves_written={moves_written} "
                f"results_updated={results_updated} elapsed={elapsed:.1f}s"
            )

    finally:
        await pool.close()

    elapsed = time.time() - started
    print(
        f"[backfill:done] games_seen={total_games_seen} parsed={parsed_games} "
        f"parse_errors={parse_errors} moves_written={moves_written} "
        f"results_updated={results_updated} elapsed={elapsed:.1f}s"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backfill moves table from games.pgn")
    parser.add_argument("--batch-size", type=int, default=200, help="Games per fetch batch")
    parser.add_argument("--move-chunk-size", type=int, default=5000, help="Rows per executemany chunk")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of games (0 = no limit)")
    parser.add_argument("--force-all", action="store_true", help="Re-parse all games with PGN, not only missing-move games")
    parser.add_argument(
        "--no-create-index",
        action="store_true",
        help="Skip creating normalized FEN index for moves",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set")

    asyncio.run(
        backfill(
            database_url=database_url,
            batch_size=args.batch_size,
            move_chunk_size=args.move_chunk_size,
            limit=args.limit,
            force_all=args.force_all,
            create_index=not args.no_create_index,
        )
    )


if __name__ == "__main__":
    main()
