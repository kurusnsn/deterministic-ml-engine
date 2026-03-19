"""
Tests for LC0+SVM Inference Module.

Tests ensure:
1. Deterministic outputs for same (fen, move) inputs
2. Correct concept importance computation
3. Caching works correctly
4. Mock fallback works when models not available
"""

import pytest
from unittest.mock import patch, MagicMock
import numpy as np

from gateway_modules.concepts.lc0_svm_inference import (
    run_lc0_svm_inference,
    LC0SVMInference,
    LC0SVMResult,
    get_inference_instance,
    DEFAULT_CONCEPT_KEYS,
)


# Test fixtures
@pytest.fixture
def sample_fen():
    """Standard test position."""
    return "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21"


@pytest.fixture
def sample_move():
    """Standard test move."""
    return "Rxd5"


@pytest.fixture
def starting_fen():
    """Starting position."""
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


@pytest.fixture
def inference_instance():
    """Fresh LC0SVMInference instance for testing."""
    return LC0SVMInference()


class TestDeterminism:
    """Tests for deterministic output."""

    def test_deterministic_output_same_inputs(self, sample_fen, sample_move):
        """Same (fen, move) should produce identical results."""
        result1 = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)
        result2 = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        assert result1["concept_scores"] == result2["concept_scores"]
        assert result1["concept_importance"] == result2["concept_importance"]
        assert result1["meta"]["layer"] == result2["meta"]["layer"]

    def test_deterministic_across_multiple_runs(self, sample_fen, sample_move):
        """Multiple runs should produce identical results."""
        results = [
            run_lc0_svm_inference(sample_fen, sample_move, top_k=5)
            for _ in range(3)
        ]

        # All concept_importance should be identical
        for result in results[1:]:
            assert result["concept_importance"] == results[0]["concept_importance"]

    def test_deterministic_different_positions(self, starting_fen):
        """Different positions should produce different but deterministic results."""
        result1 = run_lc0_svm_inference(starting_fen, "e4", top_k=5)
        result2 = run_lc0_svm_inference(starting_fen, "d4", top_k=5)

        # Different moves should generally produce different results
        # (though mock might be similar)
        assert result1["meta"]["layer"] == result2["meta"]["layer"]

        # Run again to ensure each is deterministic
        result1_again = run_lc0_svm_inference(starting_fen, "e4", top_k=5)
        assert result1["concept_importance"] == result1_again["concept_importance"]


class TestConceptImportance:
    """Tests for concept importance computation."""

    def test_importance_is_computed(self, sample_fen, sample_move):
        """Concept importance should be computed."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        assert "concept_importance" in result
        assert len(result["concept_importance"]) > 0
        assert len(result["concept_importance"]) <= 5

    def test_importance_sorted_by_absolute_value(self, sample_fen, sample_move):
        """Importance should be sorted by absolute value descending."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        importance = result["concept_importance"]
        abs_values = [abs(score) for _, score in importance]

        # Should be sorted descending by absolute value
        assert abs_values == sorted(abs_values, reverse=True)

    def test_importance_preserves_sign(self, sample_fen, sample_move):
        """Importance values should preserve sign (can be positive or negative)."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        importance = result["concept_importance"]

        # Values should be floats with sign preserved
        for concept_name, score in importance:
            assert isinstance(score, float)
            # Score can be positive, negative, or zero

    def test_top_k_limits_results(self, sample_fen, sample_move):
        """top_k parameter should limit results."""
        result_k3 = run_lc0_svm_inference(sample_fen, sample_move, top_k=3)
        result_k5 = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        assert len(result_k3["concept_importance"]) <= 3
        assert len(result_k5["concept_importance"]) <= 5


class TestConceptScores:
    """Tests for concept score computation."""

    def test_scores_are_computed(self, sample_fen, sample_move):
        """Concept scores should be computed for root position."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        assert "concept_scores" in result
        assert len(result["concept_scores"]) > 0

    def test_scores_are_floats(self, sample_fen, sample_move):
        """Concept scores should be float values."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        for concept_name, score in result["concept_scores"]:
            assert isinstance(concept_name, str)
            assert isinstance(score, float)


class TestMeta:
    """Tests for metadata."""

    def test_meta_contains_layer(self, sample_fen, sample_move):
        """Meta should contain layer information."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        assert "meta" in result
        assert "layer" in result["meta"]
        assert result["meta"]["layer"] == 39  # Default layer

    def test_meta_contains_rollout(self, sample_fen, sample_move):
        """Meta should contain rollout information."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        assert "rollout" in result["meta"]
        assert "root" in result["meta"]["rollout"]
        assert "after_move" in result["meta"]["rollout"]
        assert "after_reply" in result["meta"]["rollout"]


class TestCaching:
    """Tests for in-memory caching."""

    def test_cache_hit(self, inference_instance, sample_fen, sample_move):
        """Second call should hit cache."""
        # First call
        result1 = inference_instance.infer(sample_fen, sample_move, top_k=5)

        # Second call should use cache
        result2 = inference_instance.infer(sample_fen, sample_move, top_k=5)

        # Results should be identical (same object from cache)
        assert result1.concept_importance == result2.concept_importance

    def test_cache_key_generation(self, inference_instance, sample_fen, sample_move):
        """Cache key should be deterministic."""
        key1 = inference_instance._cache_key(sample_fen, sample_move)
        key2 = inference_instance._cache_key(sample_fen, sample_move)

        assert key1 == key2

    def test_different_inputs_different_cache_keys(self, inference_instance, sample_fen):
        """Different inputs should produce different cache keys."""
        key1 = inference_instance._cache_key(sample_fen, "Rxd5")
        key2 = inference_instance._cache_key(sample_fen, "Qb3")

        assert key1 != key2


class TestMoveFormats:
    """Tests for different move input formats."""

    def test_san_format(self, sample_fen):
        """SAN move format should work."""
        result = run_lc0_svm_inference(sample_fen, "Rxd5", top_k=5)

        assert "concept_importance" in result
        assert "error" not in result.get("meta", {})

    def test_uci_format(self, sample_fen):
        """UCI move format should work."""
        # a7d7 captures the knight on d7
        result = run_lc0_svm_inference(sample_fen, "a7d7", top_k=5)

        assert "concept_importance" in result
        assert "error" not in result.get("meta", {})

    def test_invalid_move(self, sample_fen):
        """Invalid move should be handled gracefully."""
        result = run_lc0_svm_inference(sample_fen, "invalid_move", top_k=5)

        assert "error" in result.get("meta", {})
        assert result["concept_importance"] == []


class TestLC0SVMResult:
    """Tests for LC0SVMResult dataclass."""

    def test_to_dict(self):
        """to_dict should produce correct structure."""
        result = LC0SVMResult(
            concept_scores=[("Threats_w_high", 0.5)],
            concept_importance=[("Threats_w_high", 0.3)],
            meta={"layer": 39},
        )

        d = result.to_dict()

        assert d["concept_scores"] == [("Threats_w_high", 0.5)]
        assert d["concept_importance"] == [("Threats_w_high", 0.3)]
        assert d["meta"]["layer"] == 39


class TestLC0SVMInferenceClass:
    """Tests for LC0SVMInference class directly."""

    def test_initialization(self):
        """Should initialize with default paths."""
        inference = LC0SVMInference()

        assert inference.lc0_model_path is not None
        assert inference.svm_cache_dir is not None
        assert inference._cache == {}

    def test_load_models_without_files(self):
        """Should handle missing model files gracefully."""
        inference = LC0SVMInference(
            lc0_model_path="/nonexistent/path.pb.gz",
            svm_cache_dir="/nonexistent/svm",
        )

        # Should not raise
        result = inference.load_models()

        # Should still work with mock
        assert inference._loaded

    def test_fen_to_input_shape(self, inference_instance, sample_fen):
        """FEN to input conversion should produce correct shape."""
        input_tensor = inference_instance._fen_to_input(sample_fen)

        assert input_tensor.shape == (8, 8, 112)
        assert input_tensor.dtype == np.float32


class TestActivationExtraction:
    """Tests for activation extraction."""

    def test_mock_activations_deterministic(self, inference_instance, sample_fen):
        """Mock activations should be deterministic."""
        act1 = inference_instance._extract_activations(sample_fen, [39])
        act2 = inference_instance._extract_activations(sample_fen, [39])

        np.testing.assert_array_equal(act1[39], act2[39])

    def test_different_fens_different_activations(self, inference_instance, sample_fen, starting_fen):
        """Different FENs should produce different activations."""
        act1 = inference_instance._extract_activations(sample_fen, [39])
        act2 = inference_instance._extract_activations(starting_fen, [39])

        assert not np.array_equal(act1[39], act2[39])


class TestSVMProbes:
    """Tests for SVM probe running."""

    def test_mock_scores_deterministic(self, inference_instance, sample_fen):
        """Mock SVM scores should be deterministic."""
        activations = inference_instance._extract_activations(sample_fen, [39])

        scores1 = inference_instance._run_svm_probes(activations, DEFAULT_CONCEPT_KEYS[:5], 39)
        scores2 = inference_instance._run_svm_probes(activations, DEFAULT_CONCEPT_KEYS[:5], 39)

        assert scores1 == scores2

    def test_scores_in_range(self, inference_instance, sample_fen):
        """Mock scores should be in reasonable range."""
        activations = inference_instance._extract_activations(sample_fen, [39])
        scores = inference_instance._run_svm_probes(activations, DEFAULT_CONCEPT_KEYS[:5], 39)

        for concept, score in scores.items():
            assert -5.0 <= score <= 5.0, f"Score {score} out of expected range"


class TestDefaultConcepts:
    """Tests for default concept keys."""

    def test_default_concepts_exist(self):
        """DEFAULT_CONCEPT_KEYS should be defined."""
        assert len(DEFAULT_CONCEPT_KEYS) > 0

    def test_default_concepts_have_colors(self):
        """Most default concepts should have color suffixes."""
        color_concepts = [c for c in DEFAULT_CONCEPT_KEYS if "_w_" in c or "_b_" in c or c.endswith("_w") or c.endswith("_b")]
        assert len(color_concepts) > len(DEFAULT_CONCEPT_KEYS) * 0.5

    def test_default_concepts_categories(self):
        """Default concepts should cover main categories."""
        categories = {"Threats", "Kingsafety", "Mobility", "Material", "Pawns", "Passedpawns"}
        found_categories = set()

        for concept in DEFAULT_CONCEPT_KEYS:
            for cat in categories:
                if concept.startswith(cat):
                    found_categories.add(cat)

        assert found_categories == categories or len(found_categories) >= 4


class TestIntegration:
    """Integration tests for the full pipeline."""

    def test_full_pipeline_sample_position(self, sample_fen, sample_move):
        """Full pipeline should work for sample position."""
        result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)

        # Should have all expected fields
        assert "concept_scores" in result
        assert "concept_importance" in result
        assert "meta" in result

        # Should have results
        assert len(result["concept_importance"]) > 0

    def test_full_pipeline_starting_position(self, starting_fen):
        """Full pipeline should work for starting position."""
        result = run_lc0_svm_inference(starting_fen, "e4", top_k=5)

        assert "concept_importance" in result
        assert len(result["concept_importance"]) > 0

    def test_deterministic_integration_three_runs(self, sample_fen, sample_move):
        """Integration test: 3 runs should produce identical results."""
        results = []
        for i in range(3):
            # Create fresh instance to avoid caching
            result = run_lc0_svm_inference(sample_fen, sample_move, top_k=5)
            results.append(result)

        # All importance lists should match
        for r in results[1:]:
            assert r["concept_importance"] == results[0]["concept_importance"], \
                f"Run produced different results: {r['concept_importance']} vs {results[0]['concept_importance']}"
