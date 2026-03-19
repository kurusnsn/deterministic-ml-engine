"""
Tests for Style Entropy (Phase 3).

Tests cover:
- Softmax probability conversion
- Entropy computation
- Entropy interpretation
- Integration with analyze_player_style
"""

import pytest
import math

from gateway_modules.services.style_embeddings import (
    style_probs,
    compute_style_entropy,
    interpret_entropy,
    analyze_player_style,
    ARCHETYPE_STYLES,
)


class TestStyleProbs:
    """Test softmax probability conversion."""
    
    def test_returns_list(self):
        """Should return a list of probabilities."""
        similarities = [0.8, 0.7, 0.5, 0.4, 0.3, 0.2]
        probs = style_probs(similarities)
        assert isinstance(probs, list)
        assert len(probs) == len(similarities)
    
    def test_probs_sum_to_one(self):
        """Probabilities should sum to 1.0."""
        similarities = [0.8, 0.7, 0.5, 0.4, 0.3, 0.2]
        probs = style_probs(similarities)
        assert sum(probs) == pytest.approx(1.0, rel=0.01)
    
    def test_higher_similarity_higher_prob(self):
        """Higher similarity should result in higher probability."""
        similarities = [0.9, 0.5, 0.1]
        probs = style_probs(similarities)
        assert probs[0] > probs[1] > probs[2]
    
    def test_empty_input(self):
        """Empty input should return empty list."""
        probs = style_probs([])
        assert probs == []
    
    def test_temperature_effect(self):
        """Lower temperature should make distribution more peaked."""
        similarities = [0.8, 0.4]
        probs_low_tau = style_probs(similarities, tau=0.3)
        probs_high_tau = style_probs(similarities, tau=1.0)
        
        # Lower tau = more peaked = higher max prob
        assert max(probs_low_tau) > max(probs_high_tau)


class TestComputeStyleEntropy:
    """Test entropy computation."""
    
    def test_uniform_distribution_max_entropy(self):
        """Uniform similarities should give high normalized entropy."""
        # All equal similarities
        similarities = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
        raw, normalized = compute_style_entropy(similarities)
        # Should be close to 1.0 (max entropy for uniform)
        assert normalized > 0.95
    
    def test_single_peak_low_entropy(self):
        """Single dominant similarity should give lower entropy than uniform."""
        # Note: Softmax with tau=0.7 will smooth the distribution,
        # so even peaked input won't give very low entropy
        uniform = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
        peaked = [0.99, 0.01, 0.01, 0.01, 0.01, 0.01]
        
        _, uniform_entropy = compute_style_entropy(uniform)
        _, peaked_entropy = compute_style_entropy(peaked)
        
        # Peaked should be lower than uniform
        assert peaked_entropy < uniform_entropy
    
    def test_normalized_range_0_to_1(self):
        """Normalized entropy should be in [0, 1]."""
        similarities = [0.8, 0.6, 0.5, 0.4, 0.3, 0.2]
        raw, normalized = compute_style_entropy(similarities)
        assert 0.0 <= normalized <= 1.0
    
    def test_empty_input(self):
        """Empty input should return zeros."""
        raw, normalized = compute_style_entropy([])
        assert raw == 0.0
        assert normalized == 0.0
    
    def test_single_value(self):
        """Single value should return zeros."""
        raw, normalized = compute_style_entropy([0.5])
        assert raw == 0.0
        assert normalized == 0.0
    
    def test_two_equal_values(self):
        """Two equal values should give max entropy for 2 classes."""
        similarities = [0.5, 0.5]
        raw, normalized = compute_style_entropy(similarities)
        # Max entropy for 2 classes is log2(2) = 1, normalized should be ~1.0
        assert normalized > 0.95


class TestInterpretEntropy:
    """Test entropy interpretation."""
    
    def test_specialist(self):
        """Low entropy should be classified as specialist."""
        category, description = interpret_entropy(0.20)
        assert category == "specialist"
        assert "specialist" in description.lower()
    
    def test_hybrid(self):
        """Medium-low entropy should be classified as hybrid."""
        category, description = interpret_entropy(0.40)
        assert category == "hybrid"
        assert "hybrid" in description.lower()
    
    def test_universal(self):
        """Medium-high entropy should be classified as universal."""
        category, description = interpret_entropy(0.65)
        assert category == "universal"
        assert "universal" in description.lower()
    
    def test_experimental(self):
        """High entropy should be classified as experimental."""
        category, description = interpret_entropy(0.85)
        assert category == "experimental"
        assert "experimental" in description.lower() or "variable" in description.lower()
    
    def test_boundary_cases(self):
        """Test boundary values."""
        # Just below 0.30
        cat1, _ = interpret_entropy(0.29)
        assert cat1 == "specialist"
        
        # Exactly at 0.30
        cat2, _ = interpret_entropy(0.30)
        assert cat2 == "hybrid"
        
        # Exactly at 0.55
        cat3, _ = interpret_entropy(0.55)
        assert cat3 == "universal"
        
        # Exactly at 0.75
        cat4, _ = interpret_entropy(0.75)
        assert cat4 == "experimental"


class TestAnalyzePlayerStyleWithEntropy:
    """Test that analyze_player_style includes entropy fields."""
    
    def test_returns_entropy_fields(self):
        """Should include entropy-related fields."""
        stats = {"avg_eval_swing": 100}
        result = analyze_player_style(stats)
        
        assert "style_entropy" in result
        assert "style_entropy_raw" in result
        assert "style_consistency" in result
        assert "style_consistency_description" in result
    
    def test_entropy_in_valid_range(self):
        """Normalized entropy should be in [0, 1]."""
        stats = {"avg_eval_swing": 100}
        result = analyze_player_style(stats)
        
        assert 0.0 <= result["style_entropy"] <= 1.0
    
    def test_consistency_is_valid_category(self):
        """Style consistency should be a valid category."""
        stats = {"avg_eval_swing": 100}
        result = analyze_player_style(stats)
        
        valid_categories = ["specialist", "hybrid", "universal", "experimental"]
        assert result["style_consistency"] in valid_categories
    
    def test_summary_mentions_style_type(self):
        """Summary should mention the style consistency type."""
        stats = {"avg_eval_swing": 100}
        result = analyze_player_style(stats)
        
        # Summary should contain one of the style types
        summary_lower = result["style_summary"].lower()
        assert any(cat in summary_lower for cat in ["specialist", "hybrid", "universal", "experimental"])
    
    def test_archetype_matches_still_work(self):
        """Archetype matching should still work correctly."""
        stats = {"avg_eval_swing": 100}
        result = analyze_player_style(stats)
        
        assert "archetype_matches" in result
        assert len(result["archetype_matches"]) == 3  # top_k=3
        assert "primary_archetype" in result
