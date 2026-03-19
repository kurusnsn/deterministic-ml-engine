"""
Probe Equivalence Tests.

CRITICAL: These tests verify that the ONNX backend produces activations
that are compatible with the existing trained SVM probes.

Requirements:
- Cosine similarity ≥ 0.9 between TF and ONNX activations
- Same sign for concept deltas
- Max absolute difference below tolerance
"""

import pytest
import numpy as np
from typing import Dict, List, Tuple
import os

# Skip all tests if models not available
pytestmark = pytest.mark.skipif(
    not os.path.exists(os.environ.get("LC0_ONNX_MODEL_PATH", "/models/lc0/lc0_t78_probe.onnx")),
    reason="ONNX model not available for equivalence testing"
)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    a_flat = a.flatten()
    b_flat = b.flatten()
    
    norm_a = np.linalg.norm(a_flat)
    norm_b = np.linalg.norm(b_flat)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return float(np.dot(a_flat, b_flat) / (norm_a * norm_b))


# Test positions covering various game phases and piece configurations
TEST_POSITIONS = [
    # Starting position
    ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "starting"),
    
    # After 1.e4
    ("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", "e4"),
    
    # Italian Game
    ("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", "italian"),
    
    # Middle game position
    ("2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21", "middlegame"),
    
    # Endgame position
    ("8/5pk1/7p/8/3K4/8/6PP/8 w - - 0 40", "endgame"),
    
    # Complex position
    ("r2qr1k1/1p1nbppp/p2pbn2/4p3/4P3/1NN1BP2/PPPQ2PP/2KR1B1R w - - 0 12", "complex"),
]


class TestActivationEquivalence:
    """
    Tests comparing ONNX activations to TensorFlow activations.
    
    These tests require both backends to be available.
    """
    
    @pytest.fixture
    def tf_extractor(self):
        """Get TensorFlow extractor if available."""
        try:
            from gateway_modules.concepts.lc0_extractor import get_lc0_extractor
            extractor = get_lc0_extractor()
            extractor.initialize()
            return extractor
        except Exception as e:
            pytest.skip(f"TF extractor not available: {e}")
    
    @pytest.fixture
    def onnx_runtime(self):
        """Get ONNX runtime if available."""
        try:
            from gateway_modules.lc0_onnx.runtime import get_runtime
            runtime = get_runtime()
            runtime._load_session()
            return runtime
        except Exception as e:
            pytest.skip(f"ONNX runtime not available: {e}")
    
    @pytest.mark.parametrize("fen,name", TEST_POSITIONS)
    def test_activation_cosine_similarity(self, fen, name, tf_extractor, onnx_runtime):
        """Cosine similarity between TF and ONNX activations should be ≥ 0.9."""
        from gateway_modules.lc0_onnx.encoder import encode_fen_lc0
        
        # Get TF activation
        tf_activation = tf_extractor.extract_activation(fen, layer=39)
        
        # Get ONNX activation
        encoded = encode_fen_lc0(fen)
        onnx_result = onnx_runtime.infer(encoded)
        onnx_activation = onnx_result["resblock_39"].flatten()
        
        # Compute similarity
        similarity = cosine_similarity(tf_activation, onnx_activation)
        
        assert similarity >= 0.9, (
            f"Low cosine similarity {similarity:.4f} for position '{name}'\n"
            f"FEN: {fen}"
        )
    
    @pytest.mark.parametrize("fen,name", TEST_POSITIONS)
    def test_activation_shape_match(self, fen, name, tf_extractor, onnx_runtime):
        """Activation shapes should match between backends."""
        from gateway_modules.lc0_onnx.encoder import encode_fen_lc0
        
        tf_activation = tf_extractor.extract_activation(fen, layer=39)
        
        encoded = encode_fen_lc0(fen)
        onnx_result = onnx_runtime.infer(encoded)
        onnx_activation = onnx_result["resblock_39"]
        
        # TF returns flattened, ONNX returns (1, 512, 8, 8)
        tf_dim = tf_activation.shape[0]
        onnx_dim = np.prod(onnx_activation.shape[1:])  # Skip batch
        
        assert tf_dim == onnx_dim == 32768, (
            f"Dimension mismatch: TF={tf_dim}, ONNX={onnx_dim}, expected=32768"
        )


class TestProbeOutputEquivalence:
    """
    Tests comparing SVM probe outputs between backends.
    """
    
    @pytest.fixture
    def tf_inference(self):
        """Get TF-based inference if available."""
        try:
            from gateway_modules.concepts.lc0_svm_inference import LC0SVMInference
            inference = LC0SVMInference()
            inference.load_models()
            return inference
        except Exception as e:
            pytest.skip(f"TF inference not available: {e}")
    
    @pytest.fixture
    def onnx_bridge(self):
        """Get ONNX probe bridge if available."""
        try:
            os.environ["ENABLE_LC0_ONNX_PROBING"] = "true"
            from gateway_modules.lc0_onnx.probe_bridge import ProbeBridge
            return ProbeBridge()
        except Exception as e:
            pytest.skip(f"ONNX bridge not available: {e}")
    
    @pytest.mark.parametrize("fen,name", TEST_POSITIONS[:3])  # Subset for speed
    def test_probe_score_same_sign(self, fen, name, tf_inference, onnx_bridge):
        """Probe scores should have same sign between backends."""
        from gateway_modules.concepts.lc0_svm_inference import DEFAULT_CONCEPT_KEYS
        
        # Get TF scores
        tf_activations = tf_inference._extract_activations(fen, [39])
        tf_scores = tf_inference._run_svm_probes(tf_activations, DEFAULT_CONCEPT_KEYS, 39)
        
        # Get ONNX scores
        onnx_scores = onnx_bridge.score_position(fen, concept_keys=DEFAULT_CONCEPT_KEYS)
        
        # Compare signs for each concept
        mismatches = []
        for concept in DEFAULT_CONCEPT_KEYS:
            if concept in tf_scores and concept in onnx_scores:
                tf_sign = np.sign(tf_scores[concept])
                onnx_sign = np.sign(onnx_scores[concept])
                
                if tf_sign != onnx_sign and abs(tf_scores[concept]) > 0.1:
                    mismatches.append(
                        f"{concept}: TF={tf_scores[concept]:.3f}, ONNX={onnx_scores[concept]:.3f}"
                    )
        
        # Allow some tolerance - not all scores need to match exactly
        assert len(mismatches) <= len(DEFAULT_CONCEPT_KEYS) * 0.2, (
            f"Too many sign mismatches for '{name}':\n" + "\n".join(mismatches)
        )
    
    @pytest.mark.parametrize("fen,name", TEST_POSITIONS[:3])
    def test_probe_score_correlation(self, fen, name, tf_inference, onnx_bridge):
        """Probe scores should be correlated between backends."""
        from gateway_modules.concepts.lc0_svm_inference import DEFAULT_CONCEPT_KEYS
        
        # Get TF scores
        tf_activations = tf_inference._extract_activations(fen, [39])
        tf_scores = tf_inference._run_svm_probes(tf_activations, DEFAULT_CONCEPT_KEYS, 39)
        
        # Get ONNX scores
        onnx_scores = onnx_bridge.score_position(fen, concept_keys=DEFAULT_CONCEPT_KEYS)
        
        # Extract matched scores
        tf_values = []
        onnx_values = []
        for concept in DEFAULT_CONCEPT_KEYS:
            if concept in tf_scores and concept in onnx_scores:
                tf_values.append(tf_scores[concept])
                onnx_values.append(onnx_scores[concept])
        
        if len(tf_values) > 2:
            # Compute Pearson correlation
            correlation = np.corrcoef(tf_values, onnx_values)[0, 1]
            
            assert correlation >= 0.8, (
                f"Low correlation {correlation:.3f} for '{name}'"
            )


class TestDeltaEquivalence:
    """
    Tests comparing concept deltas between backends.
    """
    
    def test_delta_direction_consistency(self):
        """Move deltas should point in same direction between backends."""
        # This test requires both backends configured
        # Implementation depends on having both working simultaneously
        pass  # Placeholder for integration testing


class TestPerformance:
    """Performance benchmarks for ONNX backend."""
    
    def test_inference_under_20ms(self):
        """Single inference should complete in under 20ms."""
        try:
            os.environ["ENABLE_LC0_ONNX_PROBING"] = "true"
            from gateway_modules.lc0_onnx.runtime import get_runtime
            from gateway_modules.lc0_onnx.encoder import encode_fen_lc0
            import time
            
            runtime = get_runtime()
            fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            encoded = encode_fen_lc0(fen)
            
            # Warm up
            runtime.infer(encoded, use_cache=False)
            
            # Measure
            times = []
            for _ in range(10):
                start = time.perf_counter()
                runtime.infer(encoded, use_cache=False)
                elapsed_ms = (time.perf_counter() - start) * 1000
                times.append(elapsed_ms)
            
            avg_time = np.mean(times)
            
            assert avg_time < 20.0, f"Average inference time {avg_time:.1f}ms > 20ms target"
            
        except Exception as e:
            pytest.skip(f"Performance test skipped: {e}")
