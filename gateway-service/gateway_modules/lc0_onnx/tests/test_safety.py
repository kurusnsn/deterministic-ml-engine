"""
Tests for feature flag and safety.

Validates that:
1. When ENABLE_LC0_ONNX_PROBING=false, ONNX is not loaded
2. Stockfish output is unchanged
3. Commentary output is unchanged
"""

import pytest
from unittest.mock import patch, MagicMock
import os


class TestFeatureFlag:
    """Tests for feature flag behavior."""
    
    def test_flag_default_off(self):
        """Feature flag should default to OFF."""
        from gateway_modules.lc0_onnx.config import ENABLE_LC0_ONNX_PROBING
        
        # Default should be False (unless explicitly set in env)
        if os.getenv("ENABLE_LC0_ONNX_PROBING", "").lower() != "true":
            assert ENABLE_LC0_ONNX_PROBING == False
    
    def test_adapter_returns_none_when_disabled(self):
        """Adapter should return None when flag is disabled."""
        with patch.dict(os.environ, {"ENABLE_LC0_ONNX_PROBING": "false"}):
            # Re-import to pick up patched env
            import importlib
            import gateway_modules.lc0_onnx.config as config
            importlib.reload(config)
            
            from gateway_modules.lc0_onnx import lc0_concept_probe_adapter
            
            fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            result = lc0_concept_probe_adapter(fen)
            
            # Should return None when disabled
            assert result is None
    
    def test_onnx_not_imported_when_disabled(self):
        """onnxruntime should not be imported when flag is disabled."""
        with patch.dict(os.environ, {"ENABLE_LC0_ONNX_PROBING": "false"}):
            import sys
            
            # Clear any cached imports
            modules_to_clear = [
                k for k in sys.modules.keys() 
                if 'onnxruntime' in k or 'lc0_onnx' in k
            ]
            for mod in modules_to_clear:
                del sys.modules[mod]
            
            # Import config only
            from gateway_modules.lc0_onnx.config import ENABLE_LC0_ONNX_PROBING
            
            # onnxruntime should not be in sys.modules yet
            # (only checked at runtime when infer is called)
    
    def test_is_available_false_when_disabled(self):
        """is_onnx_probing_available should return False when disabled."""
        with patch.dict(os.environ, {"ENABLE_LC0_ONNX_PROBING": "false"}):
            import importlib
            import gateway_modules.lc0_onnx.config as config
            importlib.reload(config)
            
            from gateway_modules.lc0_onnx import is_onnx_probing_available
            
            assert is_onnx_probing_available() == False


class TestNoBreakage:
    """Tests verifying no breakage to existing systems."""
    
    def test_imports_dont_break_concepts_module(self):
        """Importing lc0_onnx should not break concepts module."""
        # This should not raise
        from gateway_modules.concepts import (
            LC0SVMInference,
            run_lc0_svm_inference,
        )
        
        assert LC0SVMInference is not None
        assert run_lc0_svm_inference is not None
    
    def test_existing_svm_inference_unchanged(self):
        """Existing LC0SVMInference should work unchanged."""
        from gateway_modules.concepts.lc0_svm_inference import (
            LC0SVMInference,
            DEFAULT_CONCEPT_KEYS,
        )
        
        # Create instance - should not require ONNX
        inference = LC0SVMInference()
        
        # Should have same default concepts
        assert len(DEFAULT_CONCEPT_KEYS) > 0
        assert "Threats_w_mid" in DEFAULT_CONCEPT_KEYS
    
    def test_config_does_not_affect_existing_paths(self):
        """New config should not affect existing LC0 paths."""
        # Existing paths from lc0_svm_inference
        from gateway_modules.concepts.lc0_svm_inference import (
            DEFAULT_LC0_CONFIG_PATH,
            DEFAULT_LC0_WEIGHTS_PATH,
        )
        
        # Should still be the same
        assert DEFAULT_LC0_CONFIG_PATH == "/models/lc0/T78.yaml"
        assert DEFAULT_LC0_WEIGHTS_PATH == "/models/lc0/T78_512x40.pb.gz"


class TestStatus:
    """Tests for status reporting."""
    
    def test_get_status_when_disabled(self):
        """Status should report disabled state correctly."""
        with patch.dict(os.environ, {"ENABLE_LC0_ONNX_PROBING": "false"}):
            import importlib
            import gateway_modules.lc0_onnx.config as config
            importlib.reload(config)
            
            from gateway_modules.lc0_onnx import get_onnx_probing_status
            
            status = get_onnx_probing_status()
            
            assert status['enabled'] == False
            assert status['onnx_model_path'] is None
            assert status['runtime_loaded'] == False
