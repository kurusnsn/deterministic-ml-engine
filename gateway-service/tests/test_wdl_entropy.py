"""
Tests for WDL Entropy Analysis Module.

Verifies:
- Entropy monotonicity
- Delta sign correctness
- Disabled flag = no output
- Identical WDL → near-zero delta
"""

import pytest
from gateway_modules.analysis.wdl_entropy import (
    compute_wdl_entropy,
    compute_entropy_delta,
    format_entropy_for_llm,
)


class TestComputeWdlEntropy:
    """Tests for compute_wdl_entropy function."""
    
    def test_certain_win_low_entropy(self):
        """100% win should have near-zero entropy."""
        entropy = compute_wdl_entropy(1.0, 0.0, 0.0)
        assert entropy < 0.01
    
    def test_certain_loss_low_entropy(self):
        """100% loss should have near-zero entropy."""
        entropy = compute_wdl_entropy(0.0, 0.0, 1.0)
        assert entropy < 0.01
    
    def test_certain_draw_low_entropy(self):
        """100% draw should have near-zero entropy."""
        entropy = compute_wdl_entropy(0.0, 1.0, 0.0)
        assert entropy < 0.01
    
    def test_equal_probabilities_max_entropy(self):
        """Equal W/D/L should have maximum entropy (~1.585 bits)."""
        entropy = compute_wdl_entropy(1/3, 1/3, 1/3)
        assert 1.58 < entropy < 1.59
    
    def test_entropy_range(self):
        """Entropy should be in [0, log2(3)] range."""
        test_cases = [
            (0.5, 0.3, 0.2),
            (0.8, 0.1, 0.1),
            (0.1, 0.8, 0.1),
        ]
        for w, d, l in test_cases:
            entropy = compute_wdl_entropy(w, d, l)
            assert 0 <= entropy <= 1.585
    
    def test_monotonicity_more_certain(self):
        """More decisive position should have lower entropy."""
        uncertain = compute_wdl_entropy(0.4, 0.3, 0.3)
        decisive = compute_wdl_entropy(0.8, 0.1, 0.1)
        assert decisive < uncertain


class TestComputeEntropyDelta:
    """Tests for compute_entropy_delta function."""
    
    def test_identical_wdl_near_zero_delta(self):
        """Identical WDL should give near-zero delta."""
        wdl = {"w": 0.5, "d": 0.3, "l": 0.2}
        result = compute_entropy_delta(wdl, wdl)
        assert result is not None
        assert abs(result["delta"]) < 0.01
    
    def test_more_decisive_negative_delta(self):
        """Position becoming more decisive should have negative delta."""
        before = {"w": 0.4, "d": 0.3, "l": 0.3}
        after = {"w": 0.9, "d": 0.05, "l": 0.05}
        result = compute_entropy_delta(before, after)
        assert result is not None
        assert result["delta"] < 0
        assert "decisive" in result["interpretation"]
    
    def test_more_uncertain_positive_delta(self):
        """Position becoming more uncertain should have positive delta."""
        before = {"w": 0.9, "d": 0.05, "l": 0.05}
        after = {"w": 0.4, "d": 0.3, "l": 0.3}
        result = compute_entropy_delta(before, after)
        assert result is not None
        assert result["delta"] > 0
        assert "uncertain" in result["interpretation"]
    
    def test_small_change_no_significant(self):
        """Small entropy change should be 'no significant change'."""
        before = {"w": 0.5, "d": 0.3, "l": 0.2}
        after = {"w": 0.52, "d": 0.28, "l": 0.2}
        result = compute_entropy_delta(before, after)
        assert result is not None
        assert "no significant" in result["interpretation"]
    
    def test_none_input_returns_none(self):
        """None input should return None."""
        assert compute_entropy_delta(None, {"w": 0.5, "d": 0.3, "l": 0.2}) is None
        assert compute_entropy_delta({"w": 0.5, "d": 0.3, "l": 0.2}, None) is None
        assert compute_entropy_delta(None, None) is None


class TestFormatEntropyForLlm:
    """Tests for format_entropy_for_llm function."""
    
    def test_none_input_returns_none(self):
        """None input should return None."""
        assert format_entropy_for_llm(None) is None
    
    def test_small_delta_returns_none(self):
        """Small delta should return None (not worth mentioning)."""
        data = {"delta": 0.05, "interpretation": "no significant change"}
        assert format_entropy_for_llm(data) is None
    
    def test_decisive_returns_clarifying_text(self):
        """Negative delta should mention clarifying."""
        data = {"delta": -0.3, "interpretation": "position becomes more decisive"}
        result = format_entropy_for_llm(data)
        assert result is not None
        assert "clarif" in result.lower() or "decisive" in result.lower()
    
    def test_uncertain_returns_complexity_text(self):
        """Positive delta should mention complexity."""
        data = {"delta": 0.3, "interpretation": "position becomes more uncertain"}
        result = format_entropy_for_llm(data)
        assert result is not None
        assert "complex" in result.lower() or "uncertain" in result.lower()
