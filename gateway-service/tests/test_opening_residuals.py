"""
Unit tests for Opening Residuals (Step 4).

Tests verify:
- Elo expected score calculation is correct
- Residual computation works
- Residual labels are assigned correctly
- Explain includes all required fields
"""

import pytest
from typing import Dict, Any, List

from gateway_modules.config.ml_config import MLConfig
from gateway_modules.services.opening_residuals_service import (
    compute_elo_expected_score,
    compute_actual_score,
    compute_residual_label,
    compute_opening_residual,
    compute_all_opening_residuals,
    enrich_opening_stats_with_residuals,
)


class TestEloExpectedScore:
    """Test Elo expected score calculation."""
    
    def test_equal_rating_returns_half(self):
        """Equal ratings give 0.5 expected score."""
        expected = compute_elo_expected_score(1500, 1500)
        assert expected == pytest.approx(0.5, rel=0.01)
    
    def test_higher_rating_gives_higher_expected(self):
        """Player with higher rating has > 0.5 expected."""
        expected = compute_elo_expected_score(1600, 1400)
        assert expected > 0.7
    
    def test_lower_rating_gives_lower_expected(self):
        """Player with lower rating has < 0.5 expected."""
        expected = compute_elo_expected_score(1400, 1600)
        assert expected < 0.3
    
    def test_400_point_difference(self):
        """400 point difference gives ~0.91 expected for stronger player."""
        expected = compute_elo_expected_score(1900, 1500)
        assert expected == pytest.approx(0.91, rel=0.02)


class TestActualScore:
    """Test actual score computation."""
    
    def test_all_wins(self):
        """All wins = 1.0 score."""
        score = compute_actual_score(wins=5, draws=0, losses=0)
        assert score == 1.0
    
    def test_all_losses(self):
        """All losses = 0.0 score."""
        score = compute_actual_score(wins=0, draws=0, losses=5)
        assert score == 0.0
    
    def test_all_draws(self):
        """All draws = 0.5 score."""
        score = compute_actual_score(wins=0, draws=5, losses=0)
        assert score == 0.5
    
    def test_mixed_results(self):
        """Mixed results compute correctly."""
        # 2 wins + 2 draws + 1 loss = (2 + 1) / 5 = 0.6
        score = compute_actual_score(wins=2, draws=2, losses=1)
        assert score == pytest.approx(0.6, rel=0.01)
    
    def test_zero_games(self):
        """Zero games returns 0.5 (neutral)."""
        score = compute_actual_score(wins=0, draws=0, losses=0)
        assert score == 0.5


class TestResidualLabel:
    """Test residual label assignment."""
    
    def test_strong_positive_is_overperforming(self):
        """Residual >= 0.10 is overperforming."""
        label = compute_residual_label(0.15)
        assert label == "overperforming"
    
    def test_strong_negative_is_underperforming(self):
        """Residual <= -0.10 is underperforming."""
        label = compute_residual_label(-0.12)
        assert label == "underperforming"
    
    def test_small_residual_is_neutral(self):
        """Small residual is neutral."""
        assert compute_residual_label(0.05) == "neutral"
        assert compute_residual_label(-0.05) == "neutral"
        assert compute_residual_label(0.0) == "neutral"


class TestComputeOpeningResidual:
    """Test full residual computation for an opening."""
    
    def test_sufficient_games(self):
        """Residual computed with sufficient games."""
        games = [
            {"white_username": "player", "black_username": "opp1", 
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"},
            {"white_username": "player", "black_username": "opp2",
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"},
            {"white_username": "player", "black_username": "opp3",
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"},
            {"white_username": "player", "black_username": "opp4",
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"},
            {"white_username": "player", "black_username": "opp5",
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"},
        ]
        
        residual_data, explain = compute_opening_residual(
            games=games,
            user_identifier="player",
            eco="B20",
        )
        
        # 5 wins against equal opponents = actual 1.0, expected 0.5
        assert residual_data["actual_score"] == 1.0
        assert residual_data["expected_score"] == pytest.approx(0.5, rel=0.01)
        assert residual_data["residual"] == pytest.approx(0.5, rel=0.01)
        assert residual_data["residual_label"] == "overperforming"
    
    def test_insufficient_games(self):
        """Returns None residual with insufficient games."""
        games = [
            {"white_username": "player", "black_username": "opp1",
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"},
        ]
        
        config = MLConfig(residual_min_games=5)
        residual_data, explain = compute_opening_residual(
            games=games,
            user_identifier="player",
            eco="B20",
            ml_config=config,
        )
        
        assert residual_data["residual"] is None
        assert residual_data["reason"] == "insufficient_games"
    
    def test_player_as_black(self):
        """Correctly handles player as black."""
        games = [
            {"white_username": "opp1", "black_username": "player",
             "white_rating": 1500, "black_rating": 1500, "result": "0-1"},
            {"white_username": "opp2", "black_username": "player",
             "white_rating": 1500, "black_rating": 1500, "result": "0-1"},
            {"white_username": "opp3", "black_username": "player",
             "white_rating": 1500, "black_rating": 1500, "result": "0-1"},
            {"white_username": "opp4", "black_username": "player",
             "white_rating": 1500, "black_rating": 1500, "result": "0-1"},
            {"white_username": "opp5", "black_username": "player",
             "white_rating": 1500, "black_rating": 1500, "result": "0-1"},
        ]
        
        residual_data, explain = compute_opening_residual(
            games=games,
            user_identifier="player",
            eco="B20",
        )
        
        # 5 wins as black = actual 1.0
        assert residual_data["actual_score"] == 1.0
        assert residual_data["wins"] == 5
    
    def test_explain_includes_rationale(self):
        """Explain includes meaningful rationale."""
        games = [
            {"white_username": "player", "black_username": "opp",
             "white_rating": 1500, "black_rating": 1500, "result": "1-0"}
            for _ in range(5)
        ]
        
        residual_data, explain = compute_opening_residual(
            games=games,
            user_identifier="player",
            eco="B20",
        )
        
        assert "B20" in explain.rationale
        assert explain.sample_size == 5


class TestEnrichOpeningStats:
    """Test enriching opening stats with residuals."""
    
    def test_adds_residual_fields(self):
        """Residual fields are added to opening stats."""
        opening_stats = [
            {"eco": "B20", "winrate": 0.6},
            {"eco": "C50", "winrate": 0.4},
        ]
        
        residuals = {
            "B20": {
                "expected_score": 0.5,
                "residual": 0.1,
                "residual_label": "overperforming",
                "explain": {"rationale": "test"},
            },
        }
        
        enriched = enrich_opening_stats_with_residuals(opening_stats, residuals)
        
        assert enriched[0]["expected_score"] == 0.5
        assert enriched[0]["residual"] == 0.1
        assert enriched[0]["residual_label"] == "overperforming"
        
        # C50 not in residuals, should be unchanged
        assert enriched[1].get("residual") is None
