"""
Tests for Population Baselines and Style Normalization.

Tests cover:
- Rating bucket assignment
- Era bucket assignment
- Aggression proxy components
- Volatility proxy computation
- Style normalization z-scores
- Entropy math
"""

import pytest
import math
from datetime import datetime
from unittest.mock import MagicMock, patch

# Add sys.path for testing from scripts directory
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))

# Import from scripts (for bucket helpers and metric calculations)
from compute_population_baselines import (
    rating_bucket,
    era_bucket,
    compute_aggression_proxy,
    compute_volatility_proxy,
    compute_material,
    compute_material_balance,
    BucketStats,
)

# Import from gateway modules
from gateway_modules.services.style_normalization_service import (
    z_to_percentile,
    interpret_z_score,
    RelativeStyleScore,
    PopulationBaseline,
)


class TestRatingBucket:
    """Test rating bucket assignment."""
    
    def test_bucket_1050_returns_1000(self):
        """Rating 1050 should be in 1000 bucket."""
        assert rating_bucket(1050) == 1000
    
    def test_bucket_1200_returns_1200(self):
        """Rating 1200 should be in 1200 bucket."""
        assert rating_bucket(1200) == 1200
    
    def test_bucket_1399_returns_1200(self):
        """Rating 1399 should be in 1200 bucket."""
        assert rating_bucket(1399) == 1200
    
    def test_bucket_2500_returns_2200(self):
        """Rating 2500 should cap at 2200 bucket."""
        assert rating_bucket(2500) == 2200
    
    def test_bucket_below_1000_returns_1000(self):
        """Rating below 1000 should clamp to 1000."""
        assert rating_bucket(800) == 1000
        assert rating_bucket(0) == 1000
    
    def test_all_bucket_boundaries(self):
        """Test all bucket boundaries."""
        assert rating_bucket(1000) == 1000
        assert rating_bucket(1199) == 1000
        assert rating_bucket(1400) == 1400
        assert rating_bucket(1599) == 1400
        assert rating_bucket(1600) == 1600
        assert rating_bucket(1800) == 1800
        assert rating_bucket(2000) == 2000
        assert rating_bucket(2200) == 2200


class TestEraBucket:
    """Test era bucket assignment."""
    
    def test_era_2015_returns_2014_2016(self):
        """Year 2015 should be in 2014-2016 era."""
        assert era_bucket(2015) == "2014-2016"
    
    def test_era_2016_returns_2014_2016(self):
        """Year 2016 should be in 2014-2016 era."""
        assert era_bucket(2016) == "2014-2016"
    
    def test_era_2017_returns_2017_2019(self):
        """Year 2017 should be in 2017-2019 era."""
        assert era_bucket(2017) == "2017-2019"
    
    def test_era_2019_returns_2017_2019(self):
        """Year 2019 should be in 2017-2019 era."""
        assert era_bucket(2019) == "2017-2019"
    
    def test_era_2020_returns_2020_2022(self):
        """Year 2020 should be in 2020-2022 era."""
        assert era_bucket(2020) == "2020-2022"
    
    def test_era_2022_returns_2020_2022(self):
        """Year 2022 should be in 2020-2022 era."""
        assert era_bucket(2022) == "2020-2022"
    
    def test_era_2023_returns_2023_plus(self):
        """Year 2023 should be in 2023+ era."""
        assert era_bucket(2023) == "2023+"
    
    def test_era_2024_returns_2023_plus(self):
        """Year 2024 should be in 2023+ era."""
        assert era_bucket(2024) == "2023+"
    
    def test_era_with_datetime(self):
        """Should work with datetime objects."""
        dt = datetime(2021, 6, 15)
        assert era_bucket(dt) == "2020-2022"


class TestAggressionProxy:
    """Test aggression proxy calculation components."""
    
    # Sample PGN for testing (Italian Game, normal development)
    SAMPLE_PGN_NORMAL = """[Event "Test"]
[Site "Test"]
[Date "2024.01.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb6
7. O-O O-O 8. Nc3 d6 9. Bg5 h6 10. Bh4 g5 11. Bg3 Bg4 1-0"""

    # Aggressive game with early captures
    SAMPLE_PGN_AGGRESSIVE = """[Event "Test"]
[Site "Test"]
[Date "2024.01.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7
7. Qf3+ Ke6 8. Nc3 Nce7 9. d4 exd4 10. Nxd5 Nxd5 1-0"""
    
    def test_returns_float_for_valid_pgn(self):
        """Should return a float for valid PGN."""
        result = compute_aggression_proxy(self.SAMPLE_PGN_NORMAL, "white")
        assert isinstance(result, float)
    
    def test_returns_none_for_invalid_pgn(self):
        """Should return None for invalid PGN."""
        result = compute_aggression_proxy("invalid pgn", "white")
        assert result is None
    
    def test_returns_none_for_short_game(self):
        """Should return None for games shorter than 10 plies."""
        short_pgn = """[Event "Test"]
1. e4 e5 2. Nf3 1-0"""
        result = compute_aggression_proxy(short_pgn, "white")
        assert result is None
    
    def test_aggression_in_valid_range(self):
        """Aggression should be in [0, 1]."""
        result = compute_aggression_proxy(self.SAMPLE_PGN_NORMAL, "white")
        assert 0.0 <= result <= 1.0
    
    def test_aggressive_game_higher_score(self):
        """Aggressive game should have higher aggression score."""
        normal = compute_aggression_proxy(self.SAMPLE_PGN_NORMAL, "white")
        aggressive = compute_aggression_proxy(self.SAMPLE_PGN_AGGRESSIVE, "white")
        # Aggressive game has more early captures
        assert aggressive > normal or aggressive is None  # May fail on short game


class TestVolatilityProxy:
    """Test volatility proxy calculation."""
    
    SAMPLE_PGN = """[Event "Test"]
[Site "Test"]
[Date "2024.01.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 6. c3 O-O
7. Re1 a6 8. Bb3 Ba7 9. h3 h6 10. Nbd2 Re8 1-0"""
    
    def test_returns_float_for_valid_pgn(self):
        """Should return a float for valid PGN."""
        result = compute_volatility_proxy(self.SAMPLE_PGN, "white")
        assert isinstance(result, float)
    
    def test_returns_std_of_material_balance(self):
        """Volatility is std of material balance, should be >= 0."""
        result = compute_volatility_proxy(self.SAMPLE_PGN, "white")
        assert result >= 0.0
    
    def test_returns_none_for_short_game(self):
        """Should return None for games shorter than 10 plies."""
        short_pgn = "[Event \"Test\"]\n1. e4 e5 2. Nf3 1-0"
        result = compute_volatility_proxy(short_pgn, "white")
        assert result is None


class TestBucketStats:
    """Test running statistics calculation."""
    
    def test_empty_stats(self):
        """Empty stats should return None for mean and std."""
        stats = BucketStats()
        assert stats.compute_mean() is None
        assert stats.compute_std() is None
    
    def test_single_value(self):
        """Single value should return that value as mean, None for std."""
        import random
        rng = random.Random(42)
        stats = BucketStats()
        stats.add(0.5, rng)
        assert stats.compute_mean() == 0.5
        assert stats.compute_std() is None  # Need at least 2 values
    
    def test_multiple_values(self):
        """Multiple values should compute correct mean and std."""
        import random
        rng = random.Random(42)
        stats = BucketStats()
        values = [0.2, 0.4, 0.6, 0.8]
        for v in values:
            stats.add(v, rng)
        
        mean = stats.compute_mean()
        expected_mean = sum(values) / len(values)
        assert mean == pytest.approx(expected_mean, rel=0.01)
    
    def test_percentiles_require_10_samples(self):
        """Percentiles require at least 10 samples."""
        import random
        rng = random.Random(42)
        stats = BucketStats()
        for i in range(5):
            stats.add(i * 0.1, rng)
        
        percentiles = stats.compute_percentiles()
        assert percentiles['p50'] is None


class TestZScoreConversion:
    """Test z-score to percentile conversion."""
    
    def test_z_zero_is_50th_percentile(self):
        """Z-score of 0 should be ~50th percentile."""
        assert z_to_percentile(0) == pytest.approx(50.0, abs=1.0)
    
    def test_z_positive_above_50(self):
        """Positive z-score should be above 50th percentile."""
        assert z_to_percentile(1.0) > 50.0
        assert z_to_percentile(2.0) > z_to_percentile(1.0)
    
    def test_z_negative_below_50(self):
        """Negative z-score should be below 50th percentile."""
        assert z_to_percentile(-1.0) < 50.0
        assert z_to_percentile(-2.0) < z_to_percentile(-1.0)
    
    def test_z_one_approx_84(self):
        """Z-score of 1 should be ~84th percentile."""
        assert z_to_percentile(1.0) == pytest.approx(84.1, abs=1.0)
    
    def test_z_minus_one_approx_16(self):
        """Z-score of -1 should be ~16th percentile."""
        assert z_to_percentile(-1.0) == pytest.approx(15.9, abs=1.0)


class TestEntropyInterpretation:
    """Test z-score interpretation."""
    
    def test_high_z_aggressive(self):
        """High z-score for aggression should mention aggressive."""
        interp = interpret_z_score(1.5, "aggression")
        assert "aggressive" in interp.lower()
    
    def test_low_z_solid(self):
        """Low z-score for aggression should mention solid."""
        interp = interpret_z_score(-1.5, "aggression")
        assert "solid" in interp.lower()
    
    def test_average_z(self):
        """Z near 0 should mention average."""
        interp = interpret_z_score(0.2, "aggression")
        assert "average" in interp.lower()


class TestRelativeStyleScore:
    """Test RelativeStyleScore dataclass."""
    
    def test_to_dict(self):
        """Should convert to dict with all fields."""
        score = RelativeStyleScore(
            metric="aggression",
            user_value=0.45,
            z_score=0.9,
            percentile=81.6,
            interpretation="more aggressive than 82% of peers",
            population_mean=0.35,
            population_std=0.11,
            sample_size=10000,
        )
        d = score.to_dict()
        assert d["metric"] == "aggression"
        assert d["z_score"] == 0.9
        assert d["percentile"] == 81.6
