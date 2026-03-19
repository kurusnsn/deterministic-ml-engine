#!/usr/bin/env python3
"""
Population Baseline Batch Job

Computes population baselines for playing style metrics (aggression) stratified by:
- Rating bucket (1000-1199, 1200-1399, ..., 2200+)
- Time control (speed: bullet, blitz, rapid, classical)
- Player color (white, black)

The job is:
- Fast: uses server-side cursor for streaming, constant memory per bucket
- Statistically defensible: uses running statistics and reservoir sampling
- Reproducible: deterministic with fixed random seed for reservoir sampling
- Restartable: clears and repopulates the stats table

Usage:
    python scripts/compute_population_baselines.py [--limit N] [--dry-run]

Environment:
    DATABASE_URL - PostgreSQL connection string

Output:
    Populates population_style_stats table with mean, std, and percentile values.
"""

import argparse
import logging
import math
import os
import random
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import chess
import chess.pgn
import io
import psycopg2
from psycopg2.extras import execute_batch

# Configuration
BATCH_SIZE = 10000
MIN_SAMPLE_SIZE = 50  # Set to 5000 for production with 25M games
RESERVOIR_SIZE = 1000
RANDOM_SEED = 42

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# =============================================================================
# Rating Bucket Helper
# =============================================================================

def rating_bucket(rating: int) -> int:
    """
    Return canonical rating bucket for a given rating.
    
    Buckets: 1000, 1200, 1400, 1600, 1800, 2000, 2200
    
    Examples:
        1050 -> 1000
        1200 -> 1200
        1399 -> 1200
        2500 -> 2200
    """
    if rating < 1000:
        return 1000  # Clamp low ratings into first bucket
    return min((rating // 200) * 200, 2200)


# =============================================================================
# Era Bucket Helper
# =============================================================================

def era_bucket(date) -> str:
    """
    Return canonical era bucket for a given date.
    
    Era buckets reflect chess meta periods:
        2014-2016: Pre-AlphaZero era
        2017-2019: Post-AlphaZero adaptation
        2020-2022: Pandemic/online boom
        2023+: Current era
    
    Args:
        date: datetime object or year integer
        
    Returns:
        Era bucket string
        
    Examples:
        2015 -> "2014-2016"
        2019 -> "2017-2019"
        2024 -> "2023+"
    """
    year = date.year if hasattr(date, 'year') else date
    if year < 2017:
        return "2014-2016"
    if year < 2020:
        return "2017-2019"
    if year < 2023:
        return "2020-2022"
    return "2023+"


# =============================================================================
# Aggression Proxy Calculator
# =============================================================================

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}


def compute_material(board: chess.Board, color: chess.Color) -> int:
    """Compute total material for a color."""
    total = 0
    for piece_type, value in PIECE_VALUES.items():
        total += len(board.pieces(piece_type, color)) * value
    return total


def compute_material_balance(board: chess.Board, color: chess.Color) -> int:
    """Compute material balance (player - opponent) for a given color."""
    opponent_color = not color
    player_material = compute_material(board, color)
    opponent_material = compute_material(board, opponent_color)
    return player_material - opponent_material


# =============================================================================
# Volatility Proxy Calculator (Engine-free)
# =============================================================================

def compute_volatility_proxy(pgn_text: str, player_color: str) -> Optional[float]:
    """
    Compute volatility proxy as standard deviation of material balance over plies 1-20.
    
    This is NOT true eval volatility - it's a population-level proxy that captures
    how varied the material swings are in the opening phase.
    
    Args:
        pgn_text: PGN string of the game
        player_color: 'white' or 'black'
    
    Returns:
        Standard deviation of material balance, or None if game cannot be parsed
    """
    try:
        game = chess.pgn.read_game(io.StringIO(pgn_text))
        if game is None:
            return None
    except Exception:
        return None
    
    color = chess.WHITE if player_color.lower() == 'white' else chess.BLACK
    
    board = game.board()
    moves = list(game.mainline_moves())
    
    if len(moves) < 10:
        return None  # Too short to meaningfully analyze
    
    # Track material balance for first 20 plies
    material_balances = []
    
    for ply, move in enumerate(moves):
        if ply >= 20:
            break
        
        board.push(move)
        balance = compute_material_balance(board, color)
        material_balances.append(balance)
    
    if len(material_balances) < 5:
        return None
    
    # Compute standard deviation
    n = len(material_balances)
    mean = sum(material_balances) / n
    variance = sum((x - mean) ** 2 for x in material_balances) / n
    std = math.sqrt(variance)
    
    return std


def compute_aggression_proxy(pgn_text: str, player_color: str) -> Optional[float]:
    """
    Compute cheap aggression proxy for a player in a game.
    
    aggression_raw =
        0.4 * early_capture_rate
      + 0.3 * material_imbalance_acceptance
      + 0.3 * delayed_castle_or_king_move
    
    Args:
        pgn_text: PGN string of the game
        player_color: 'white' or 'black'
    
    Returns:
        Aggression score in [0, 1], or None if game cannot be parsed
    """
    try:
        game = chess.pgn.read_game(io.StringIO(pgn_text))
        if game is None:
            return None
    except Exception:
        return None
    
    color = chess.WHITE if player_color.lower() == 'white' else chess.BLACK
    opponent_color = not color
    
    board = game.board()
    moves = list(game.mainline_moves())
    
    if len(moves) < 10:
        return None  # Too short to meaningfully analyze
    
    # Track metrics
    captures_by_player = 0
    player_plies = 0
    material_deficit_plies = 0
    consecutive_deficit = 0
    accepted_imbalance = False
    castled = False
    king_moved_early = False
    
    for ply, move in enumerate(moves):
        is_player_move = (ply % 2 == 0) == (color == chess.WHITE)
        
        if is_player_move:
            player_plies += 1
            
            # Track early captures (first 20 plies = 10 moves each)
            if ply < 20 and board.is_capture(move):
                captures_by_player += 1
            
            # Track castling
            if board.is_castling(move):
                castled = True
            
            # Track king moves before ply 10
            if ply < 10 and board.piece_at(move.from_square) == chess.Piece(chess.KING, color):
                if not board.is_castling(move):
                    king_moved_early = True
        
        # Execute move
        board.push(move)
        
        # Track material imbalance after opponent moves (player accepting deficit)
        if not is_player_move:
            player_material = compute_material(board, color)
            opponent_material = compute_material(board, opponent_color)
            
            if opponent_material - player_material >= 1:
                consecutive_deficit += 1
                if consecutive_deficit >= 2:
                    accepted_imbalance = True
            else:
                consecutive_deficit = 0
    
    # Compute components
    # early_capture_rate: captures in first 20 plies / 20
    early_capture_rate = captures_by_player / 20.0 if player_plies > 0 else 0.0
    early_capture_rate = min(early_capture_rate, 1.0)  # Cap at 1.0
    
    # material_imbalance_acceptance: 1 if accepted deficit for 2+ plies
    material_imbalance_acceptance = 1.0 if accepted_imbalance else 0.0
    
    # delayed_castle_or_king_move: 1 if no castle by ply 10 OR king moved early
    delayed_castle_or_king_move = 1.0 if (not castled or king_moved_early) else 0.0
    
    # Weighted sum
    aggression_raw = (
        0.4 * early_capture_rate +
        0.3 * material_imbalance_acceptance +
        0.3 * delayed_castle_or_king_move
    )
    
    return aggression_raw


# =============================================================================
# Statistics Aggregator
# =============================================================================

@dataclass
class BucketStats:
    """Running statistics for a single bucket."""
    count: int = 0
    sum_val: float = 0.0
    sum_sq: float = 0.0
    reservoir: List[float] = field(default_factory=list)
    reservoir_count: int = 0  # Total items seen (for reservoir sampling)
    
    def add(self, value: float, rng: random.Random):
        """Add a value to the running statistics."""
        self.count += 1
        self.sum_val += value
        self.sum_sq += value * value
        self.reservoir_count += 1
        
        # Reservoir sampling (Algorithm R)
        if len(self.reservoir) < RESERVOIR_SIZE:
            self.reservoir.append(value)
        else:
            j = rng.randint(0, self.reservoir_count - 1)
            if j < RESERVOIR_SIZE:
                self.reservoir[j] = value
    
    def compute_mean(self) -> Optional[float]:
        if self.count == 0:
            return None
        return self.sum_val / self.count
    
    def compute_std(self) -> Optional[float]:
        if self.count < 2:
            return None
        mean = self.sum_val / self.count
        variance = (self.sum_sq / self.count) - (mean * mean)
        # Handle floating point errors
        if variance < 0:
            variance = 0
        return math.sqrt(variance)
    
    def compute_percentiles(self) -> Dict[str, Optional[float]]:
        """Compute p25, p50, p75, p90 from reservoir."""
        if len(self.reservoir) < 10:
            return {'p25': None, 'p50': None, 'p75': None, 'p90': None}
        
        sorted_values = sorted(self.reservoir)
        n = len(sorted_values)
        
        def percentile(p: float) -> float:
            k = (n - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return sorted_values[int(k)]
            return sorted_values[int(f)] * (c - k) + sorted_values[int(c)] * (k - f)
        
        return {
            'p25': percentile(0.25),
            'p50': percentile(0.50),
            'p75': percentile(0.75),
            'p90': percentile(0.90),
        }


# =============================================================================
# Main Batch Job
# =============================================================================

def get_db_connection():
    """Get database connection from environment."""
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        logger.error("DATABASE_URL environment variable not set")
        sys.exit(1)
    return psycopg2.connect(dsn)


def run_batch_job(limit: Optional[int] = None, dry_run: bool = False, skip_era: bool = False):
    """
    Run the population baseline batch job.
    
    Args:
        limit: Optional limit on number of rows to process
        dry_run: If True, compute stats but don't write to database
        skip_era: If True, use 'all' for era instead of bucketing by date
    """
    random.seed(RANDOM_SEED)
    rng = random.Random(RANDOM_SEED)
    
    conn = get_db_connection()
    
    try:
        # Use server-side cursor for streaming
        cursor_name = 'population_baseline_cursor'
        
        with conn.cursor(name=cursor_name) as cursor:
            cursor.itersize = BATCH_SIZE
            
            # Query games with players
            query = """
                SELECT 
                    g.id AS game_id,
                    g.perf AS speed,
                    p.color,
                    p.rating,
                    g.pgn,
                    COALESCE(g.played_at, g.start_time, g.created_at) AS played_at
                FROM games g
                JOIN players p ON p.game_id = g.id
                WHERE p.rating IS NOT NULL 
                  AND g.pgn IS NOT NULL
                  AND g.perf IS NOT NULL
            """
            
            if limit:
                query += f" LIMIT {limit}"
            
            logger.info("Starting query execution...")
            cursor.execute(query)
            
            # Aggregators: (rating_bucket, speed, era, color, metric) -> BucketStats
            # We track separate stats for each metric
            aggression_stats: Dict[Tuple[int, str, str, str], BucketStats] = defaultdict(BucketStats)
            volatility_stats: Dict[Tuple[int, str, str, str], BucketStats] = defaultdict(BucketStats)
            
            rows_processed = 0
            rows_skipped = 0
            start_time = time.time()
            last_log_time = start_time
            
            logger.info("Processing rows...")
            
            while True:
                rows = cursor.fetchmany(BATCH_SIZE)
                if not rows:
                    break
                
                for row in rows:
                    game_id, speed, color, rating, pgn, played_at = row
                    rows_processed += 1
                    
                    # Skip invalid data
                    if not speed or not color or not rating or not pgn:
                        rows_skipped += 1
                        continue
                    
                    # Determine era bucket (or use 'all' if skip_era is True)
                    if skip_era:
                        era = "all"
                    else:
                        era = era_bucket(played_at) if played_at else "2023+"
                    
                    # Determine rating bucket and key
                    bucket = rating_bucket(rating)
                    key = (bucket, speed.lower(), era, color.lower())
                    
                    # Compute and add aggression proxy
                    aggression = compute_aggression_proxy(pgn, color)
                    if aggression is not None:
                        aggression_stats[key].add(aggression, rng)
                    
                    # Compute and add volatility proxy
                    volatility = compute_volatility_proxy(pgn, color)
                    if volatility is not None:
                        volatility_stats[key].add(volatility, rng)
                    
                    # Count skipped only if BOTH metrics failed
                    if aggression is None and volatility is None:
                        rows_skipped += 1
                
                # Progress logging
                current_time = time.time()
                if current_time - last_log_time >= 10:  # Log every 10 seconds
                    elapsed = current_time - start_time
                    rate = rows_processed / elapsed if elapsed > 0 else 0
                    logger.info(
                        f"Processed {rows_processed:,} rows "
                        f"({rows_skipped:,} skipped) - "
                        f"{rate:.0f} rows/sec - "
                        f"{len(aggression_stats)} aggression buckets, "
                        f"{len(volatility_stats)} volatility buckets"
                    )
                    last_log_time = current_time
        
        elapsed = time.time() - start_time
        logger.info(
            f"Processing complete: {rows_processed:,} rows in {elapsed:.1f}s "
            f"({rows_skipped:,} skipped)"
        )
        
        # Compute final statistics and prepare for insert
        results = []
        skipped_buckets = []
        
        def process_metric_stats(metric_stats: dict, metric_name: str):
            """Process stats for a single metric and add to results."""
            for (bucket, speed, era, color), bucket_stats in metric_stats.items():
                if bucket_stats.count < MIN_SAMPLE_SIZE:
                    skipped_buckets.append((metric_name, bucket, speed, era, color, bucket_stats.count))
                    continue
                
                mean = bucket_stats.compute_mean()
                std = bucket_stats.compute_std()
                percentiles = bucket_stats.compute_percentiles()
                
                results.append({
                    'rating_bucket': bucket,
                    'speed': speed,
                    'era': era,
                    'color': color,
                    'metric': metric_name,
                    'mean': mean,
                    'std': std,
                    'p25': percentiles['p25'],
                    'p50': percentiles['p50'],
                    'p75': percentiles['p75'],
                    'p90': percentiles['p90'],
                    'sample_size': bucket_stats.count,
                })
        
        # Process both metrics
        process_metric_stats(aggression_stats, 'aggression')
        process_metric_stats(volatility_stats, 'volatility')
        
        logger.info(f"Generated {len(results)} bucket statistics (aggression + volatility)")
        
        if skipped_buckets:
            logger.warning(
                f"Skipped {len(skipped_buckets)} buckets with < {MIN_SAMPLE_SIZE} samples:"
            )
            for metric, bucket, speed, era, color, count in sorted(skipped_buckets):
                logger.warning(f"  ({metric}, {bucket}, {speed}, {era}, {color}): {count} samples")
        
        # Write to database
        if dry_run:
            logger.info("DRY RUN - not writing to database")
            for r in results[:5]:
                logger.info(f"  Sample: {r}")
        else:
            logger.info("Writing results to database...")
            
            with conn.cursor() as write_cursor:
                # Clear existing data for both metrics
                write_cursor.execute(
                    "DELETE FROM population_style_stats WHERE metric IN ('aggression', 'volatility')"
                )
                deleted = write_cursor.rowcount
                logger.info(f"Deleted {deleted} existing rows")
                
                # Insert new data (now includes era column)
                insert_query = """
                    INSERT INTO population_style_stats 
                        (rating_bucket, speed, era, color, metric, mean, std, p25, p50, p75, p90, sample_size, computed_at)
                    VALUES 
                        (%(rating_bucket)s, %(speed)s, %(era)s, %(color)s, %(metric)s, %(mean)s, %(std)s, %(p25)s, %(p50)s, %(p75)s, %(p90)s, %(sample_size)s, NOW())
                """
                
                execute_batch(write_cursor, insert_query, results)
                conn.commit()
                
                logger.info(f"Inserted {len(results)} rows")
        
        logger.info("Batch job complete!")
        
        # Summary statistics
        total_samples = sum(r['sample_size'] for r in results)
        logger.info(f"Total samples across all buckets: {total_samples:,}")
        
        return results
        
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Compute population baselines for playing style metrics'
    )
    parser.add_argument(
        '--limit', type=int, default=None,
        help='Limit number of rows to process'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Compute stats but do not write to database'
    )
    parser.add_argument(
        '--no-era', action='store_true',
        help='Skip era bucketing (use when all data is from same time period, e.g., Nov 2025)'
    )
    
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("Population Baseline Batch Job")
    logger.info(f"Started at: {datetime.now().isoformat()}")
    logger.info(f"Limit: {args.limit or 'None'}")
    logger.info(f"Dry run: {args.dry_run}")
    logger.info(f"Skip era: {args.no_era}")
    logger.info("=" * 60)
    
    run_batch_job(limit=args.limit, dry_run=args.dry_run, skip_era=args.no_era)


if __name__ == "__main__":
    main()
