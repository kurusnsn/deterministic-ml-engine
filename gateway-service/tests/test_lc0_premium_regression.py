"""
LC0 Premium Augmentation Tests.

Tests for ensuring:
1. Baseline unchanged when flags OFF
2. Overlay presence when premium + flags ON
3. Determinism of sampling and overlays
4. Comparison diff accuracy
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Import config and context
from gateway_modules.config.ml_config import MLConfig
from gateway_modules.config.lc0_premium_config import (
    get_lc0_premium_context,
    is_lc0_premium_available,
    LC0PremiumContext
)

# Import position sampler
from gateway_modules.services.reports.lc0_position_sampler import (
    sample_positions_for_lc0,
    SampledPositions
)


class TestLC0PremiumConfig:
    """Tests for LC0 premium context and gating."""
    
    def test_free_user_gets_all_disabled(self):
        """Free users should have all LC0 features disabled."""
        config = MLConfig(lc0_premium_all=True)
        context = get_lc0_premium_context("free", config)
        
        assert context.user_is_premium is False
        assert context.any_enabled is False
        assert context.reports_enabled is False
        assert context.puzzles_enabled is False
    
    def test_premium_user_with_flags_off(self):
        """Premium user with all flags OFF should have features disabled."""
        config = MLConfig()  # All defaults OFF
        context = get_lc0_premium_context("premium", config)
        
        assert context.user_is_premium is True
        assert context.any_enabled is False
    
    def test_premium_user_with_all_flag(self):
        """Premium user with lc0_premium_all=True should have all features enabled."""
        config = MLConfig(lc0_premium_all=True)
        context = get_lc0_premium_context("premium", config)
        
        assert context.user_is_premium is True
        assert context.any_enabled is True
        assert context.all_enabled is True
        assert context.reports_enabled is True
        assert context.puzzles_enabled is True
        assert context.repertoire_enabled is True
        assert context.insights_enabled is True
    
    def test_premium_user_with_individual_flags(self):
        """Premium user with individual flags should have only those enabled."""
        config = MLConfig(
            lc0_premium_puzzles=True,
            lc0_premium_reports=True
        )
        context = get_lc0_premium_context("premium", config)
        
        assert context.any_enabled is True
        assert context.all_enabled is False
        assert context.puzzles_enabled is True
        assert context.reports_enabled is True
        assert context.repertoire_enabled is False
        assert context.insights_enabled is False
    
    def test_none_subscription_treated_as_free(self):
        """None subscription status should be treated as free."""
        config = MLConfig(lc0_premium_all=True)
        context = get_lc0_premium_context(None, config)
        
        assert context.user_is_premium is False
        assert context.any_enabled is False
    
    def test_is_lc0_premium_available_helper(self):
        """Test the convenience helper function."""
        config = MLConfig(lc0_premium_puzzles=True)
        
        assert is_lc0_premium_available("premium", config) is True
        assert is_lc0_premium_available("free", config) is False
        assert is_lc0_premium_available(None, config) is False


class TestLC0PositionSampler:
    """Tests for deterministic position sampling."""
    
    @pytest.fixture
    def sample_report(self):
        """Create a sample report for testing."""
        return {
            "generated_puzzles": [
                {"puzzle_id": "pz1", "fen": "fen1", "mistake_type": "blunder"},
                {"puzzle_id": "pz2", "fen": "fen2", "mistake_type": "mistake"},
                {"puzzle_id": "pz3", "fen": "fen3", "mistake_type": "mistake"},
            ],
            "weak_lines": [
                {"id": "wl1", "avg_eval_swing": 200, "games_count": 5, "puzzle_ids": []},
            ],
            "engine_analysis": {
                "moves": [
                    {"ply": 10, "fen_before": "fen4", "eval_delta": 150, "eco": "B00"},
                    {"ply": 12, "fen_before": "fen5", "eval_delta": 50, "eco": "B00"},
                    {"ply": 20, "fen_before": "fen6", "eval_delta": 300, "eco": "C00"},
                ]
            },
            "white_repertoire": {},
            "black_repertoire": {},
        }
    
    def test_sampler_returns_positions(self, sample_report):
        """Sampler should return categorized positions."""
        sampled = sample_positions_for_lc0(sample_report, max_positions=80)
        
        assert isinstance(sampled, SampledPositions)
        assert len(sampled.puzzle_fens) > 0
        assert sampled.total_count > 0
    
    def test_sampler_is_deterministic(self, sample_report):
        """Same inputs and seed should produce same output."""
        sampled1 = sample_positions_for_lc0(sample_report, max_positions=80, seed=42)
        sampled2 = sample_positions_for_lc0(sample_report, max_positions=80, seed=42)
        
        assert sampled1.puzzle_fens == sampled2.puzzle_fens
        assert sampled1.turning_point_fens == sampled2.turning_point_fens
        assert sampled1.opening_fens == sampled2.opening_fens
        assert sampled1.total_count == sampled2.total_count
    
    def test_sampler_respects_max_positions(self, sample_report):
        """Sampler should not exceed max_positions."""
        sampled = sample_positions_for_lc0(sample_report, max_positions=5)
        
        assert sampled.total_count <= 5
    
    def test_sampler_prioritizes_blunders(self, sample_report):
        """Blunders should be sampled before mistakes."""
        sampled = sample_positions_for_lc0(sample_report, max_positions=80)
        
        # fen1 (blunder) should be first
        assert sampled.puzzle_fens[0] == "fen1"
    
    def test_sampler_samples_turning_points(self, sample_report):
        """High eval swing positions should be sampled as turning points."""
        sampled = sample_positions_for_lc0(sample_report, max_positions=80)
        
        # fen6 has highest eval swing (300)
        assert "fen6" in sampled.turning_point_fens
    
    def test_empty_report_returns_empty_sampling(self):
        """Empty report should return empty sampling."""
        sampled = sample_positions_for_lc0({}, max_positions=80)
        
        assert sampled.total_count == 0


class TestLC0PuzzleOverlay:
    """Tests for puzzle overlay generation."""
    
    def test_overlay_reranks_by_clarity(self):
        """Puzzles should be reranked by LC0 clarity metric."""
        from gateway_modules.services.reports.premium_lc0.lc0_puzzle_overlay import (
            generate_puzzle_overlay
        )
        
        puzzles = [
            {"puzzle_id": "pz1", "fen": "fen1", "best_move": "e2e4"},
            {"puzzle_id": "pz2", "fen": "fen2", "best_move": "d2d4"},
        ]
        
        lc0_results = {
            "fen1": {"value": 0.5, "policy_entropy": 3.5, "policy_topk": []},  # High entropy
            "fen2": {"value": 0.5, "policy_entropy": 1.0, "policy_topk": []},  # Low entropy
        }
        
        overlay = generate_puzzle_overlay(puzzles, lc0_results)
        
        assert overlay is not None
        # pz2 should rank higher (lower entropy = clearer)
        assert overlay["reranked_puzzle_ids"][0] == "pz2"
    
    def test_overlay_adds_tags(self):
        """Overlay should add appropriate tags based on LC0 analysis."""
        from gateway_modules.services.reports.premium_lc0.lc0_puzzle_overlay import (
            generate_puzzle_overlay
        )
        
        puzzles = [
            {"puzzle_id": "pz1", "fen": "fen1", "best_move": "e2e4"},
        ]
        
        lc0_results = {
            "fen1": {
                "value": 0.1,  # Close to 0 = high tension
                "policy_entropy": 3.5,  # High entropy
                "policy_topk": [
                    {"uci": "e2e4", "p": 0.3},
                    {"uci": "d2d4", "p": 0.25},
                ],
            },
        }
        
        overlay = generate_puzzle_overlay(puzzles, lc0_results)
        
        assert overlay is not None
        annotations = overlay["puzzle_annotations"]["pz1"]
        assert "high_tension" in annotations["tags"]
    
    def test_overlay_empty_without_data(self):
        """Overlay should return None without data."""
        from gateway_modules.services.reports.premium_lc0.lc0_puzzle_overlay import (
            generate_puzzle_overlay
        )
        
        assert generate_puzzle_overlay([], {}) is None
        assert generate_puzzle_overlay(None, None) is None


class TestLC0InsightOverlay:
    """Tests for insight overlay generation."""
    
    def test_detects_conversion_difficulty(self):
        """Should detect winning positions that are hard to convert."""
        from gateway_modules.services.reports.premium_lc0.lc0_insight_overlay import (
            generate_insight_overlay
        )
        
        lc0_results = {
            "fen1": {"value": 0.7, "policy_entropy": 3.5},  # Winning but high entropy
            "fen2": {"value": 0.8, "policy_entropy": 3.0},  # Winning but high entropy
        }
        
        overlay = generate_insight_overlay([], lc0_results, [])
        
        assert overlay is not None
        insight_types = [i["type"] for i in overlay["extra_insights"]]
        assert "conversion_difficulty" in insight_types
    
    def test_detects_tension_patterns(self):
        """Should detect high tension patterns across positions."""
        from gateway_modules.services.reports.premium_lc0.lc0_insight_overlay import (
            generate_insight_overlay
        )
        
        # Create many high-entropy positions
        lc0_results = {
            f"fen{i}": {"value": 0.1, "policy_entropy": 3.5}
            for i in range(10)
        }
        
        overlay = generate_insight_overlay([], lc0_results, [])
        
        assert overlay is not None
        insight_types = [i["type"] for i in overlay["extra_insights"]]
        assert "tension_handling" in insight_types


class TestLC0ComparisonSummary:
    """Tests for comparison summary generation."""
    
    def test_counts_reranked_puzzles(self):
        """Should correctly count reranked puzzles."""
        from gateway_modules.services.reports.premium_lc0.lc0_compare import (
            generate_comparison_summary
        )
        
        puzzle_overlay = {
            "reranked_puzzle_ids": ["pz1", "pz2"],
            "puzzle_annotations": {"pz1": {}, "pz2": {}},
        }
        
        summary = generate_comparison_summary(puzzle_overlay, None, None)
        
        assert summary["puzzles_reranked"] is True
        assert summary["puzzles_with_annotations"] == 2
    
    def test_counts_disagreements(self):
        """Should correctly count repertoire disagreements."""
        from gateway_modules.services.reports.premium_lc0.lc0_compare import (
            generate_comparison_summary
        )
        
        repertoire_overlay = {
            "node_suggestions": {
                "fen1": {"disagreement": True},
                "fen2": {"disagreement": False},
                "fen3": {"disagreement": True},
            }
        }
        
        summary = generate_comparison_summary(None, repertoire_overlay, None)
        
        assert summary["repertoire_nodes_analyzed"] == 3
        assert summary["repertoire_nodes_with_disagreement"] == 2


class TestBaselineUnchanged:
    """Critical tests ensuring baseline is never modified."""
    
    def test_report_without_premium_matches_baseline(self):
        """With all flags OFF, report should have no premium_lc0 section."""
        # This would be an integration test that needs actual report generation
        # For now, we verify the gating logic
        config = MLConfig()  # All OFF
        context = get_lc0_premium_context("premium", config)
        
        # Even premium users shouldn't get overlays if flags are off
        assert context.any_enabled is False
    
    def test_free_user_never_gets_premium_section(self):
        """Free users should never get premium_lc0 section even with flags ON."""
        config = MLConfig(lc0_premium_all=True)
        context = get_lc0_premium_context("free", config)
        
        assert context.any_enabled is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
