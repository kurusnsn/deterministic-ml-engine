import sys
import os
import psycopg2
from psycopg2.extras import execute_batch
import chess.pgn
import time
import datetime

# Configuration
BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]
BATCH_SIZE = 5000

def get_db_connection():
    dsn = os.getenv("OPENING_BOOK_DB_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        print("Error: OPENING_BOOK_DB_DSN or DATABASE_URL must be set.")
        sys.exit(1)
    return psycopg2.connect(dsn)

def rating_bucket(white_elo, black_elo):
    if white_elo <= 0 or black_elo <= 0:
        return 0
    avg = (white_elo + black_elo) // 2
    b = 0
    for limit in BUCKETS:
        if avg < limit:
            return b
        b = limit
    return 2500  # 2500+

def speed_from_timecontrol(tc):
    # tc like "180+0", "300+3", "600+0", "-" etc.
    if not tc or tc == "-":
        return None
    try:
        if "+" in tc:
            base_str, inc_str = tc.split("+")
            base = int(base_str)
            inc = int(inc_str)
        else:
             # handle cases with just time, though lichess usually sends + 
             base = int(tc)
             inc = 0
    except Exception:
        return None

    # Lichess estimated duration = base + 40 * inc
    total = base + 40 * inc

    if total < 180:
        return "bullet"
    if total < 480:
        return "blitz"
    if total < 1500:
        return "rapid"
    return "classical"

def game_result(headers):
    res = headers.get("Result")
    if res == "1-0":
        return (1, 0, 0)
    if res == "0-1":
        return (0, 0, 1)
    if res == "1/2-1/2":
        return (0, 1, 0)
    return None

def process_stream():
    conn = get_db_connection()
    conn.autocommit = False # Use transactions for batches
    cur = conn.cursor()

    games_processed = 0
    moves_processed = 0
    start_time = time.time()
    batch = []

    print("Starting ETL process...", file=sys.stderr)

    while True:
        game = chess.pgn.read_game(sys.stdin)
        if game is None:
            break

        games_processed += 1
        headers = game.headers
        
        # Filter for Standard variant
        if headers.get("Variant", "Standard") != "Standard":
            continue

        # Determine speed
        tc = headers.get("TimeControl")
        speed = speed_from_timecontrol(tc)
        if not speed:
            continue

        # Determine ratings
        try:
            w_elo = int(headers.get("WhiteElo", 0))
            b_elo = int(headers.get("BlackElo", 0))
        except ValueError:
            continue

        bucket = rating_bucket(w_elo, b_elo)

        # Determine result
        res_tuple = game_result(headers)
        if not res_tuple:
            continue
        
        w_res, d_res, b_res = res_tuple

        # Walk moves
        board = game.board()
        for move in game.mainline_moves():
            fen_before = board.fen()
            board.push(move)
            move_uci = move.uci()
            
            # (fen, move_uci, speed, bucket, games, white, draws, black)
            # using 1 for games count per move occurrence
            batch.append((fen_before, move_uci, speed, bucket, 1, w_res, d_res, b_res))
            moves_processed += 1

        if len(batch) >= BATCH_SIZE:
            flush_batch(cur, batch)
            conn.commit()
            batch = []
            
            if games_processed % 1000 == 0:
                 elapsed = time.time() - start_time
                 print(f"Processed {games_processed} games, {moves_processed} moves. {games_processed/elapsed:.2f} games/s", file=sys.stderr)

    # Flush remaining
    if batch:
        flush_batch(cur, batch)
        conn.commit()

    conn.close()
    print(f"Finished. Total: {games_processed} games, {moves_processed} moves.", file=sys.stderr)

def flush_batch(cur, batch):
    execute_batch(cur, """
        INSERT INTO opening_book_stats
            (fen, move_uci, speed, rating_bucket,
             games, white_wins, draws, black_wins)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (fen, move_uci, speed, rating_bucket) DO UPDATE
        SET games      = opening_book_stats.games + EXCLUDED.games,
            white_wins = opening_book_stats.white_wins + EXCLUDED.white_wins,
            draws      = opening_book_stats.draws + EXCLUDED.draws,
            black_wins = opening_book_stats.black_wins + EXCLUDED.black_wins,
            last_updated_at = now();
    """, batch)

if __name__ == "__main__":
    try:
        process_stream()
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)
