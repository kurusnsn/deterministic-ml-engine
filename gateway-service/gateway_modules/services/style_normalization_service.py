"""
Style Normalization Service

Normalizes user style metrics relative to population baselines.
Uses population_style_stats table to compute z-scores and percentiles.

Formula:
    relative_metric = (user_metric - population_mean) / population_std

Example:
    relative_aggression = +0.9σ means "more aggressive than ~84% of peers"

Lookup key: (rating_bucket, speed, era, color)
Fallback strategy:
    1. Try exact era → 2. Collapse era → 3. Collapse color → Never collapse rating
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple, TYPE_CHECKING
import math
import logging

if TYPE_CHECKING:
    from psycopg2.extensions import connection as Connection

logger = logging.getLogger(__name__)


# =============================================================================
# Rating Bucket Helper (duplicated for service independence)
# =============================================================================

def rating_bucket(rating: int) -> int:
    """
    Return canonical rating bucket for a given rating.
    Buckets: 1000, 1200, 1400, 1600, 1800, 2000, 2200
    """
    if rating < 1000:
        return 1000
    return min((rating // 200) * 200, 2200)


def era_bucket(date) -> str:
    """
    Return canonical era bucket for a given date.
    Era buckets: '2014-2016', '2017-2019', '2020-2022', '2023+'
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
# Data Classes
# =============================================================================

@dataclass
class PopulationBaseline:
    """Population baseline statistics for a metric."""
    rating_bucket: int
    speed: str
    era: str
    color: str
    metric: str
    mean: float
    std: float
    p25: float
    p50: float
    p75: float
    p90: float
    sample_size: int


@dataclass
class RelativeStyleScore:
    """User style score relative to population."""
    metric: str
    user_value: float
    z_score: float              # (user - mean) / std
    percentile: float           # Approximate from z-score (0-100)
    interpretation: str         # Human-readable interpretation
    population_mean: float
    population_std: float
    sample_size: int
    fallback_used: Optional[str] = None  # 'era', 'color', or None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'metric': self.metric,
            'user_value': self.user_value,
            'z_score': round(self.z_score, 2),
            'percentile': round(self.percentile, 1),
            'interpretation': self.interpretation,
            'population_mean': round(self.population_mean, 4),
            'population_std': round(self.population_std, 4),
            'sample_size': self.sample_size,
            'fallback_used': self.fallback_used,
        }


# =============================================================================
# Z-Score to Percentile Conversion
# =============================================================================

def z_to_percentile(z: float) -> float:
    """
    Convert z-score to approximate percentile using standard normal CDF.
    Uses polynomial approximation for speed.
    
    Args:
        z: Z-score (standard deviations from mean)
        
    Returns:
        Percentile (0-100)
    """
    # Clamp extreme z-scores
    z = max(-4.0, min(4.0, z))
    
    # Polynomial approximation of standard normal CDF
    # Abramowitz and Stegun approximation
    if z >= 0:
        t = 1.0 / (1.0 + 0.2316419 * z)
        poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + 
               t * (-1.821255978 + t * 1.330274429))))
        cdf = 1.0 - 0.3989422803 * math.exp(-z * z / 2.0) * poly
    else:
        t = 1.0 / (1.0 - 0.2316419 * z)
        poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + 
               t * (-1.821255978 + t * 1.330274429))))
        cdf = 0.3989422803 * math.exp(-z * z / 2.0) * poly
    
    return cdf * 100.0


def interpret_z_score(z: float, metric: str) -> str:
    """
    Generate human-readable interpretation of z-score for a metric.
    
    Args:
        z: Z-score
        metric: Metric name ('aggression', 'volatility')
        
    Returns:
        Human-readable interpretation
    """
    percentile = z_to_percentile(z)
    
    # Metric-specific interpretations
    if metric == 'aggression':
        if z >= 1.5:
            return f"highly aggressive (top {100-percentile:.0f}% of peers)"
        elif z >= 0.5:
            return f"more aggressive than {percentile:.0f}% of peers"
        elif z >= -0.5:
            return "average aggression for your rating/speed"
        elif z >= -1.5:
            return f"more solid/defensive than {100-percentile:.0f}% of peers"
        else:
            return f"very solid (bottom {percentile:.0f}% for aggression)"
    
    elif metric == 'volatility':
        if z >= 1.5:
            return f"highly volatile play (top {100-percentile:.0f}% of peers)"
        elif z >= 0.5:
            return f"more volatile than {percentile:.0f}% of peers"
        elif z >= -0.5:
            return "average volatility for your rating/speed"
        elif z >= -1.5:
            return f"more stable than {100-percentile:.0f}% of peers"
        else:
            return f"very stable (bottom {percentile:.0f}% for volatility)"
    
    else:
        if z >= 0:
            return f"above average ({percentile:.0f}th percentile)"
        else:
            return f"below average ({percentile:.0f}th percentile)"


# =============================================================================
# Population Baseline Lookup (with fallback)
# =============================================================================

# In-memory cache for baseline lookups
_baseline_cache: Dict[Tuple[int, str, str, str, str], Optional[PopulationBaseline]] = {}


def lookup_population_baseline(
    conn: "Connection",
    rating_bucket: int,
    speed: str,
    era: str,
    color: str,
    metric: str,
) -> Tuple[Optional[PopulationBaseline], Optional[str]]:
    """
    Look up population baseline with fallback strategy.
    
    Fallback order:
        1. Exact match (rating_bucket, speed, era, color, metric)
        2. Collapse era (try all eras, average if multiple)
        3. Collapse color (try 'white' and 'black', average if multiple)
        4. Never collapse rating bucket
    
    Args:
        conn: Database connection
        rating_bucket: Player's rating bucket (1000, 1200, ..., 2200)
        speed: Time control ('bullet', 'blitz', 'rapid', 'classical')
        era: Era bucket ('2014-2016', '2017-2019', '2020-2022', '2023+')
        color: Player color ('white', 'black')
        metric: Metric name ('aggression', 'volatility')
        
    Returns:
        Tuple of (PopulationBaseline or None, fallback_used or None)
    """
    speed = speed.lower()
    color = color.lower()
    
    # Check cache first
    cache_key = (rating_bucket, speed, era, color, metric)
    if cache_key in _baseline_cache:
        cached = _baseline_cache[cache_key]
        return (cached, None) if cached else (None, None)
    
    # Try exact match
    baseline = _query_baseline(conn, rating_bucket, speed, era, color, metric)
    if baseline:
        _baseline_cache[cache_key] = baseline
        return baseline, None
    
    # Fallback 1: Collapse era (average across all eras)
    baseline = _query_baseline_collapse_era(conn, rating_bucket, speed, color, metric)
    if baseline:
        _baseline_cache[cache_key] = baseline
        return baseline, 'era'
    
    # Fallback 2: Collapse color (average across both colors)
    baseline = _query_baseline_collapse_era_and_color(conn, rating_bucket, speed, metric)
    if baseline:
        _baseline_cache[cache_key] = baseline
        return baseline, 'color'
    
    # No baseline found (never collapse rating)
    _baseline_cache[cache_key] = None
    return None, None


def _query_baseline(
    conn: "Connection",
    rating_bucket: int,
    speed: str,
    era: str,
    color: str,
    metric: str,
) -> Optional[PopulationBaseline]:
    """Query for exact baseline match."""
    query = """
        SELECT rating_bucket, speed, era, color, metric,
               mean, std, p25, p50, p75, p90, sample_size
        FROM population_style_stats
        WHERE rating_bucket = %s AND speed = %s AND era = %s AND color = %s AND metric = %s
    """
    with conn.cursor() as cursor:
        cursor.execute(query, (rating_bucket, speed, era, color, metric))
        row = cursor.fetchone()
        if row:
            return PopulationBaseline(*row)
    return None


def _query_baseline_collapse_era(
    conn: "Connection",
    rating_bucket: int,
    speed: str,
    color: str,
    metric: str,
) -> Optional[PopulationBaseline]:
    """Query averaging across all eras."""
    query = """
        SELECT 
            %s as rating_bucket, %s as speed, 'all' as era, %s as color, %s as metric,
            SUM(mean * sample_size) / SUM(sample_size) as mean,
            -- Approximate pooled std
            SQRT(SUM(std * std * sample_size) / SUM(sample_size)) as std,
            AVG(p25) as p25, AVG(p50) as p50, AVG(p75) as p75, AVG(p90) as p90,
            SUM(sample_size) as sample_size
        FROM population_style_stats
        WHERE rating_bucket = %s AND speed = %s AND color = %s AND metric = %s
        GROUP BY 1, 2, 3, 4, 5
        HAVING SUM(sample_size) > 0
    """
    with conn.cursor() as cursor:
        cursor.execute(query, (
            rating_bucket, speed, color, metric,
            rating_bucket, speed, color, metric
        ))
        row = cursor.fetchone()
        if row:
            return PopulationBaseline(*row)
    return None


def _query_baseline_collapse_era_and_color(
    conn: "Connection",
    rating_bucket: int,
    speed: str,
    metric: str,
) -> Optional[PopulationBaseline]:
    """Query averaging across all eras and both colors."""
    query = """
        SELECT 
            %s as rating_bucket, %s as speed, 'all' as era, 'both' as color, %s as metric,
            SUM(mean * sample_size) / SUM(sample_size) as mean,
            SQRT(SUM(std * std * sample_size) / SUM(sample_size)) as std,
            AVG(p25) as p25, AVG(p50) as p50, AVG(p75) as p75, AVG(p90) as p90,
            SUM(sample_size) as sample_size
        FROM population_style_stats
        WHERE rating_bucket = %s AND speed = %s AND metric = %s
        GROUP BY 1, 2, 3, 4, 5
        HAVING SUM(sample_size) > 0
    """
    with conn.cursor() as cursor:
        cursor.execute(query, (
            rating_bucket, speed, metric,
            rating_bucket, speed, metric
        ))
        row = cursor.fetchone()
        if row:
            return PopulationBaseline(*row)
    return None


def clear_baseline_cache():
    """Clear the in-memory baseline cache."""
    global _baseline_cache
    _baseline_cache = {}


# =============================================================================
# Main Normalization Function
# =============================================================================

def normalize_user_style(
    conn: "Connection",
    user_metric: float,
    rating: int,
    speed: str,
    era: str,
    color: str,
    metric_name: str = "aggression",
) -> Optional[RelativeStyleScore]:
    """
    Normalize a user's style metric relative to population baseline.
    
    Args:
        conn: Database connection
        user_metric: User's raw metric value
        rating: User's rating
        speed: Time control ('bullet', 'blitz', 'rapid', 'classical')
        era: Era bucket or date
        color: Player color ('white', 'black')
        metric_name: Metric to normalize ('aggression', 'volatility')
        
    Returns:
        RelativeStyleScore with z-score and interpretation, or None if no baseline
    """
    bucket = rating_bucket(rating)
    
    # Handle era as date or string
    if not isinstance(era, str):
        era = era_bucket(era)
    
    baseline, fallback_used = lookup_population_baseline(
        conn, bucket, speed, era, color, metric_name
    )
    
    if baseline is None:
        logger.warning(
            f"No population baseline for {metric_name} at "
            f"rating={bucket}, speed={speed}, era={era}, color={color}"
        )
        return None
    
    # Avoid division by zero
    if baseline.std == 0 or baseline.std is None:
        z_score = 0.0
    else:
        z_score = (user_metric - baseline.mean) / baseline.std
    
    percentile = z_to_percentile(z_score)
    interpretation = interpret_z_score(z_score, metric_name)
    
    return RelativeStyleScore(
        metric=metric_name,
        user_value=user_metric,
        z_score=z_score,
        percentile=percentile,
        interpretation=interpretation,
        population_mean=baseline.mean,
        population_std=baseline.std,
        sample_size=baseline.sample_size,
        fallback_used=fallback_used,
    )


def normalize_all_user_styles(
    conn: "Connection",
    user_stats: Dict[str, float],
    rating: int,
    speed: str,
    era: str,
    color: str,
) -> Dict[str, RelativeStyleScore]:
    """
    Normalize all available user style metrics.
    
    Args:
        conn: Database connection
        user_stats: Dict mapping metric names to user values
                    e.g. {'aggression': 0.35, 'volatility': 2.1}
        rating: User's rating
        speed: Time control
        era: Era bucket or date
        color: Player color
        
    Returns:
        Dict mapping metric names to RelativeStyleScore objects
    """
    results = {}
    
    for metric_name, user_value in user_stats.items():
        score = normalize_user_style(
            conn, user_value, rating, speed, era, color, metric_name
        )
        if score:
            results[metric_name] = score
    
    return results


# =============================================================================
# Async Versions (for asyncpg compatibility in report generation)
# =============================================================================

async def _query_baseline_async(
    conn,  # asyncpg connection
    rating_bucket_val: int,
    speed: str,
    era: str,
    color: str,
    metric: str,
) -> Optional[PopulationBaseline]:
    """Query for exact baseline match using asyncpg."""
    query = """
        SELECT rating_bucket, speed, era, color, metric,
               mean, std, p25, p50, p75, p90, sample_size
        FROM population_style_stats
        WHERE rating_bucket = $1 AND speed = $2 AND era = $3 AND color = $4 AND metric = $5
    """
    row = await conn.fetchrow(query, rating_bucket_val, speed, era, color, metric)
    if row:
        return PopulationBaseline(
            rating_bucket=row['rating_bucket'],
            speed=row['speed'],
            era=row['era'],
            color=row['color'],
            metric=row['metric'],
            mean=float(row['mean']) if row['mean'] else 0.0,
            std=float(row['std']) if row['std'] else 0.0,
            p25=float(row['p25']) if row['p25'] else 0.0,
            p50=float(row['p50']) if row['p50'] else 0.0,
            p75=float(row['p75']) if row['p75'] else 0.0,
            p90=float(row['p90']) if row['p90'] else 0.0,
            sample_size=int(row['sample_size']) if row['sample_size'] else 0,
        )
    return None


async def _query_baseline_collapse_era_async(
    conn,  # asyncpg connection
    rating_bucket_val: int,
    speed: str,
    color: str,
    metric: str,
) -> Optional[PopulationBaseline]:
    """Query averaging across all eras using asyncpg."""
    query = """
        SELECT 
            $1::int as rating_bucket, $2::text as speed, 'all' as era, $3::text as color, $4::text as metric,
            COALESCE(SUM(mean * sample_size) / NULLIF(SUM(sample_size), 0), 0) as mean,
            COALESCE(SQRT(SUM(std * std * sample_size) / NULLIF(SUM(sample_size), 0)), 0) as std,
            COALESCE(AVG(p25), 0) as p25, COALESCE(AVG(p50), 0) as p50, 
            COALESCE(AVG(p75), 0) as p75, COALESCE(AVG(p90), 0) as p90,
            COALESCE(SUM(sample_size), 0) as sample_size
        FROM population_style_stats
        WHERE rating_bucket = $5 AND speed = $6 AND color = $7 AND metric = $8
        HAVING SUM(sample_size) > 0
    """
    row = await conn.fetchrow(query, 
        rating_bucket_val, speed, color, metric,
        rating_bucket_val, speed, color, metric
    )
    if row and row['sample_size'] > 0:
        return PopulationBaseline(
            rating_bucket=row['rating_bucket'],
            speed=row['speed'],
            era=row['era'],
            color=row['color'],
            metric=row['metric'],
            mean=float(row['mean']),
            std=float(row['std']),
            p25=float(row['p25']),
            p50=float(row['p50']),
            p75=float(row['p75']),
            p90=float(row['p90']),
            sample_size=int(row['sample_size']),
        )
    return None


async def lookup_population_baseline_async(
    conn,  # asyncpg connection
    rating_bucket_val: int,
    speed: str,
    era: str,
    color: str,
    metric: str,
) -> Tuple[Optional[PopulationBaseline], Optional[str]]:
    """
    Async version of lookup_population_baseline for asyncpg.
    """
    speed = speed.lower()
    color = color.lower()
    
    # Check cache first
    cache_key = (rating_bucket_val, speed, era, color, metric)
    if cache_key in _baseline_cache:
        cached = _baseline_cache[cache_key]
        return (cached, None) if cached else (None, None)
    
    # Try exact match
    baseline = await _query_baseline_async(conn, rating_bucket_val, speed, era, color, metric)
    if baseline:
        _baseline_cache[cache_key] = baseline
        return baseline, None
    
    # Fallback 1: Collapse era
    baseline = await _query_baseline_collapse_era_async(conn, rating_bucket_val, speed, color, metric)
    if baseline:
        _baseline_cache[cache_key] = baseline
        return baseline, 'era'
    
    # No baseline found
    _baseline_cache[cache_key] = None
    return None, None


async def normalize_user_style_async(
    conn,  # asyncpg connection
    user_metric: float,
    rating: int,
    speed: str,
    era: str,
    color: str,
    metric_name: str = "aggression",
) -> Optional[RelativeStyleScore]:
    """
    Async version of normalize_user_style for asyncpg.
    """
    bucket = rating_bucket(rating)
    
    # Handle era as date or string
    if not isinstance(era, str):
        era = era_bucket(era)
    
    baseline, fallback_used = await lookup_population_baseline_async(
        conn, bucket, speed, era, color, metric_name
    )
    
    if baseline is None:
        logger.warning(
            f"No population baseline for {metric_name} at "
            f"rating={bucket}, speed={speed}, era={era}, color={color}"
        )
        return None
    
    # Avoid division by zero
    if baseline.std == 0 or baseline.std is None:
        z_score = 0.0
    else:
        z_score = (user_metric - baseline.mean) / baseline.std
    
    percentile = z_to_percentile(z_score)
    interpretation = interpret_z_score(z_score, metric_name)
    
    return RelativeStyleScore(
        metric=metric_name,
        user_value=user_metric,
        z_score=z_score,
        percentile=percentile,
        interpretation=interpretation,
        population_mean=baseline.mean,
        population_std=baseline.std,
        sample_size=baseline.sample_size,
        fallback_used=fallback_used,
    )
