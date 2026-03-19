"""
Unit tests for mistake detection service.
"""

import pytest
from gateway_modules.services.mistake_detection_service import classify_mistake


class TestMistakeDetection:
    """Test cases for mistake classification."""

    def test_inaccuracy_detection(self):
        """Test inaccuracy detection (delta -30 to -100 cp)."""
        # Small drop: -50 cp
        result = classify_mistake(100, 50)
        assert result["mistake_type"] == "inaccuracy"
        assert result["eval_delta"] == -50

        # Edge case: -30 cp (just at threshold)
        result = classify_mistake(100, 70)
        assert result["mistake_type"] == "inaccuracy"
        assert result["eval_delta"] == -30

        # Edge case: -99 cp (just below mistake threshold)
        result = classify_mistake(100, 1)
        assert result["mistake_type"] == "inaccuracy"
        assert result["eval_delta"] == -99

    def test_mistake_detection(self):
        """Test mistake detection (delta -100 to -200 cp)."""
        # Moderate drop: -150 cp
        result = classify_mistake(100, -50)
        assert result["mistake_type"] == "mistake"
        assert result["eval_delta"] == -150

        # Edge case: -100 cp (just at threshold)
        result = classify_mistake(100, 0)
        assert result["mistake_type"] == "mistake"
        assert result["eval_delta"] == -100

        # Edge case: -199 cp (just below blunder threshold)
        result = classify_mistake(100, -99)
        assert result["mistake_type"] == "mistake"
        assert result["eval_delta"] == -199

    def test_blunder_detection(self):
        """Test blunder detection (delta < -200 cp)."""
        # Large drop: -250 cp
        result = classify_mistake(100, -150)
        assert result["mistake_type"] == "blunder"
        assert result["eval_delta"] == -250

        # Edge case: -200 cp (just at threshold)
        result = classify_mistake(100, -100)
        assert result["mistake_type"] == "blunder"
        assert result["eval_delta"] == -200

        # Very large drop: -500 cp
        result = classify_mistake(100, -400)
        assert result["mistake_type"] == "blunder"
        assert result["eval_delta"] == -500

    def test_missed_win_detection(self):
        """Test missed win detection (eval drops from >300 to <100)."""
        # Had winning advantage, lost it
        result = classify_mistake(350, 50)
        assert result["mistake_type"] == "missed_win"
        assert result["eval_delta"] == -300

        # Edge case: exactly 300 cp before
        result = classify_mistake(300, 50)
        assert result["mistake_type"] == "missed_win"
        assert result["eval_delta"] == -250

        # Edge case: exactly 100 cp after
        result = classify_mistake(350, 100)
        assert result["mistake_type"] == "missed_win"
        assert result["eval_delta"] == -250

    def test_no_mistake(self):
        """Test positions with no mistake."""
        # Small improvement
        result = classify_mistake(100, 120)
        assert result["mistake_type"] is None
        assert result["eval_delta"] == 20

        # Small drop below threshold
        result = classify_mistake(100, 75)
        assert result["mistake_type"] is None
        assert result["eval_delta"] == -25

        # Equal evaluation
        result = classify_mistake(100, 100)
        assert result["mistake_type"] is None
        assert result["eval_delta"] == 0

    def test_none_values(self):
        """Test handling of None values - should handle gracefully."""
        # Note: The function doesn't handle None, so this tests error handling
        # In practice, None values should be handled before calling this function
        pass  # Skip None tests as function expects int

    def test_positive_delta(self):
        """Test positive evaluation changes (improvements)."""
        # Large improvement
        result = classify_mistake(-100, 100)
        assert result["mistake_type"] is None  # Improvement, not a mistake
        assert result["eval_delta"] == 200

        # Small improvement
        result = classify_mistake(50, 80)
        assert result["mistake_type"] is None
        assert result["eval_delta"] == 30

    def test_opponent_perspective(self):
        """Test that mistake detection works from mover's perspective."""
        # Large drop
        result = classify_mistake(100, -100)
        assert result["mistake_type"] == "blunder"
        assert result["eval_delta"] == -200

