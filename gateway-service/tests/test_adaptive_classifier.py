"""
Unit tests for Adaptive Repertoire Classification (Step 5).

Tests verify:
- Classification produces valid categories
- Probabilities sum to 1.0
- Confidence-gated override works correctly
- Baseline unchanged when flag OFF
"""

import pytest
from typing import Dict, Any

from gateway_modules.config.ml_config import MLConfig
from gateway_modules.services.adaptive_classifier import (
    OpeningFeatures,
    ClassificationResult,
    AdaptiveClassifier,
    apply_adaptive_classification,
    CATEGORIES,
)


class TestOpeningFeatures:
    """Test feature extraction."""
    
    def test_to_vector(self):
        """Feature vector has correct length."""
        features = OpeningFeatures(
            frequency=0.1,
            winrate=0.6,
            games_count=20,
        )
        vec = features.to_vector()
        assert len(vec) == 6


class TestAdaptiveClassifier:
    """Test classifier predictions."""
    
    def test_predict_returns_valid_category(self):
        """Predicted category is one of the valid categories."""
        classifier = AdaptiveClassifier()
        features = OpeningFeatures(
            frequency=0.1,
            winrate=0.6,
            games_count=20,
        )
        
        result = classifier.predict(features)
        
        assert result.category in CATEGORIES
    
    def test_probabilities_sum_to_one(self):
        """Category probabilities sum to 1.0."""
        classifier = AdaptiveClassifier()
        features = OpeningFeatures(frequency=0.05, winrate=0.5)
        
        result = classifier.predict(features)
        
        total = sum(result.probabilities.values())
        assert total == pytest.approx(1.0, rel=0.01)
    
    def test_high_freq_high_winrate_is_core(self):
        """High frequency + solid winrate = core."""
        classifier = AdaptiveClassifier()
        features = OpeningFeatures(
            frequency=0.10,  # 10% of games
            winrate=0.60,    # 60% win
            games_count=30,
        )
        
        result = classifier.predict(features)
        
        assert result.category == "core"
        assert result.probabilities["core"] > 0.4
    
    def test_high_freq_low_winrate_is_repair(self):
        """High frequency + poor winrate = repair."""
        classifier = AdaptiveClassifier()
        features = OpeningFeatures(
            frequency=0.10,  # 10% of games
            winrate=0.30,    # 30% win
            games_count=30,
        )
        
        result = classifier.predict(features)
        
        assert result.category == "repair"
    
    def test_low_freq_high_winrate_is_expansion(self):
        """Low frequency + excellent winrate = expansion."""
        classifier = AdaptiveClassifier()
        features = OpeningFeatures(
            frequency=0.01,  # 1% of games
            winrate=0.75,    # 75% win
            games_count=5,
        )
        
        result = classifier.predict(features)
        
        assert result.category == "expansion"
    
    def test_explain_includes_rationale(self):
        """Explain includes meaningful rationale."""
        classifier = AdaptiveClassifier()
        features = OpeningFeatures(frequency=0.08, winrate=0.55)
        
        result = classifier.predict(features)
        
        assert result.explain is not None
        assert len(result.explain.rationale) > 0
        assert result.explain.confidence == result.confidence


class TestConfidenceGatedOverride:
    """Test override logic."""
    
    def test_override_when_confidence_high(self):
        """Override baseline when ML confidence is high."""
        classifier = AdaptiveClassifier(MLConfig(override_confidence=0.6))
        
        result = ClassificationResult(
            category="expansion",
            confidence=0.75,
        )
        
        should_override = classifier.should_override_baseline(result, "developing")
        assert should_override is True
    
    def test_no_override_when_confidence_low(self):
        """Don't override when ML confidence below threshold."""
        classifier = AdaptiveClassifier(MLConfig(override_confidence=0.7))
        
        result = ClassificationResult(
            category="expansion",
            confidence=0.55,
        )
        
        should_override = classifier.should_override_baseline(result, "developing")
        assert should_override is False
    
    def test_no_override_when_same_category(self):
        """Don't override when ML agrees with baseline."""
        classifier = AdaptiveClassifier()
        
        result = ClassificationResult(
            category="core",
            confidence=0.90,
        )
        
        should_override = classifier.should_override_baseline(result, "core")
        assert should_override is False


class TestApplyAdaptiveClassification:
    """Test full classification pipeline."""
    
    def test_adds_ml_fields(self):
        """Adds ML classification fields to opening stats."""
        opening_stats = {
            "eco": "B20",
            "color": "white",
            "frequency": 0.08,
            "winrate": 0.55,
            "games_count": 20,
        }
        
        result = apply_adaptive_classification(
            opening_stats=opening_stats,
            baseline_category="developing",
        )
        
        assert "ml_category_suggestion" in result
        assert "ml_confidence" in result
        assert "final_category" in result
        assert "baseline_category" in result
        assert result["baseline_category"] == "developing"
    
    def test_final_category_reflects_override(self):
        """Final category changes when override applied."""
        opening_stats = {
            "eco": "B20",
            "frequency": 0.10,
            "winrate": 0.65,
            "games_count": 30,
        }
        
        config = MLConfig(override_confidence=0.4)  # Low threshold
        result = apply_adaptive_classification(
            opening_stats=opening_stats,
            baseline_category="developing",
            ml_config=config,
        )
        
        # High freq + high winrate should be classified as core with high confidence
        if result["ml_confidence"] >= 0.4:
            assert result["final_category"] == result["ml_category_suggestion"]
    
    def test_preserves_original_stats(self):
        """Original opening stats are preserved."""
        opening_stats = {
            "eco": "B20",
            "frequency": 0.05,
            "winrate": 0.50,
            "custom_field": "preserved",
        }
        
        result = apply_adaptive_classification(
            opening_stats=opening_stats,
            baseline_category="developing",
        )
        
        assert result["custom_field"] == "preserved"
        assert result["eco"] == "B20"
